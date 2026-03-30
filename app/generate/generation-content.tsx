"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ArrowLeft,
  CheckCircle,
  Circle,
  Clock,
  Code,
  FileText,
  Folder,
  FolderOpen,
  ImageIcon,
  Download,
  Play,
  Settings,
  ChevronRight,
  ChevronDown,
} from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useState, useEffect } from "react"
import { parseXml } from "../lib/steps"
import { CodeEditor } from "@/components/CodeEditor"
import { FileExplorer } from "@/components/FileExplorer"
import { useWebContainer } from "@/hooks/useWebcontainers"
import { PreviewFrame } from "@/components/PreviewFrame"
import { StepType, Step } from "../lib/steps"

// Module-level — never resets on re-render
let stepCounter = Date.now();
const nextId = () => ++stepCounter;

interface PromptMessage {
  role: "user" | "model";
  content: string;
}

interface FileItem {
  name: string;
  type: 'file' | 'folder';
  children?: FileItem[];
  content?: string;
  path: string;
}

function FileIcon({ type, name }: { type: string; name: string }) {
  if (type === "folder") return <Folder className="h-4 w-4 text-blue-400" />
  if (name.endsWith(".tsx") || name.endsWith(".ts")) return <Code className="h-4 w-4 text-indigo-400" />
  if (name.endsWith(".css")) return <Settings className="h-4 w-4 text-pink-400" />
  if (name.endsWith(".json")) return <FileText className="h-4 w-4 text-yellow-400" />
  if (name.endsWith(".js")) return <Code className="h-4 w-4 text-yellow-300" />
  if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".ico"))
    return <ImageIcon className="h-4 w-4 text-teal-400" />
  return <FileText className="h-4 w-4 text-slate-400" />
}

function getLanguageFromFile(filename: string): string {
  if (filename.endsWith(".tsx") || filename.endsWith(".jsx")) return "typescript"
  if (filename.endsWith(".ts")) return "typescript"
  if (filename.endsWith(".js")) return "javascript"
  if (filename.endsWith(".css")) return "css"
  if (filename.endsWith(".json")) return "json"
  if (filename.endsWith(".html")) return "html"
  return "plaintext"
}

function FileTreeNode({
  node,
  level = 0,
  setSelectedFile,
  selectedFile,
}: {
  node: FileItem;
  level?: number;
  setSelectedFile: (file: string) => void;
  selectedFile: string
}) {
  const [isOpen, setIsOpen] = useState(level < 2)

  return (
    <div>
      <div
        className={`flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer transition-all duration-150 ${
          level > 0 ? "ml-3" : ""
        } ${
          node.type === "file" && selectedFile.includes(node.name)
            ? "bg-indigo-500/10 border border-indigo-500/20"
            : "hover:bg-white/5"
        }`}
        onClick={() => {
          if (node.type === "folder") {
            setIsOpen(!isOpen)
          } else if (node.type === "file") {
            setSelectedFile(node.path)
          }
        }}
      >
        {node.type === "folder" && (
          <div className="flex items-center">
            {isOpen ? (
              <ChevronDown className="h-3 w-3 text-slate-500 mr-1" />
            ) : (
              <ChevronRight className="h-3 w-3 text-slate-500 mr-1" />
            )}
          </div>
        )}
        {node.type === "folder" ? (
          isOpen ? (
            <FolderOpen className="h-4 w-4 text-blue-400" />
          ) : (
            <Folder className="h-4 w-4 text-blue-400" />
          )
        ) : (
          <div className="ml-4">
            <FileIcon type={node.type} name={node.name} />
          </div>
        )}
        <span className="text-sm font-medium text-slate-300 truncate">{node.name}</span>
        {node.type === "file" && (
          <span className="ml-auto text-[10px] font-mono text-slate-600 shrink-0">
            {getLanguageFromFile(node.name)}
          </span>
        )}
      </div>
      {node.type === "folder" && isOpen && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              level={level + 1}
              setSelectedFile={setSelectedFile}
              selectedFile={selectedFile}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function GenerationContent() {
  const searchParams = useSearchParams()
  const prompt = searchParams.get("prompt") || ""
  const webcontainer = useWebContainer()

  const [steps, setSteps] = useState<Step[]>([])
  const [progress, setProgress] = useState(0)
  const [loading, setLoading] = useState(true)
  const [files, setFiles] = useState<FileItem[]>([])
  const [userPrompt, setUserPrompt] = useState<string>("")
  const [llmMessages, setLlmMessages] = useState<PromptMessage[]>([])
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null)

  // ── ALL LOGIC BELOW IS UNTOUCHED ──

  async function backendPrompt(prompt: string) {
    const res = await fetch("/api/template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    })
    const data = await res.json()
    console.log("RAW API RESPONSE:", JSON.stringify(data, null, 2))

    if (!data?.prompts?.length) throw new Error("No prompts received from the server")

    const promptai: string[] = data.prompts
    const uiprompts: string = data.uiPrompts[0]

    setSteps(parseXml(uiprompts).map((x: Step) => ({
      ...x,
      id: nextId(),
      status: "pending" as const,
    })))

    const uiMessages: PromptMessage[] = data.uiPrompts.map((p: string) => ({
      role: "user" as const,
      content: p,
    }))

    const messages = [
      ...promptai.map((p: string) => ({ role: "user" as const, content: p })),
      ...uiMessages,
      { role: "user" as const, content: prompt },
    ]

    const result = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    })
    const dat = await result.json()
    console.log("Chat response:", JSON.stringify(dat, null, 2))

    const chatResponse: string = dat.response ?? dat.content ?? dat.message ?? ""

    if (chatResponse) {
      setSteps(s => [...s, ...parseXml(chatResponse).map((x: Step) => ({
        ...x,
        id: nextId(),
        status: "pending" as const,
      }))])
    }
    setLlmMessages([
      ...promptai.map((p: string) => ({ role: "user" as const, content: p })),
      ...uiMessages,
      { role: "user" as const, content: prompt },
      { role: "model" as const, content: chatResponse },
    ])

    setLoading(false)
  }

  useEffect(() => {
    backendPrompt(prompt)
  }, [])

  useEffect(() => {
    const pendingSteps = steps.filter(({ status }) => status === "pending")
    if (pendingSteps.length === 0) return

    let originalFiles = [...files]
    let updateHappened = false

    pendingSteps.forEach(step => {
      updateHappened = true
      if (step?.type === StepType.CreateFile) {
        let parsedPath = step.path
          ?.replace(/^\//, "")
          .split("/") ?? []

        if (!parsedPath.length || parsedPath[0] === "") return

        let currentFileStructure = [...originalFiles]
        const finalAnswerRef = currentFileStructure

        let currentFolder = ""
        while (parsedPath.length) {
          currentFolder = `${currentFolder}/${parsedPath[0]}`
          const currentFolderName = parsedPath[0]
          parsedPath = parsedPath.slice(1)

          if (!parsedPath.length) {
            const file = currentFileStructure.find(x => x.path === currentFolder)
            if (!file) {
              currentFileStructure.push({
                name: currentFolderName,
                type: 'file',
                path: currentFolder,
                content: step.code,
              })
            } else {
              file.content = step.code
            }
          } else {
            const folder = currentFileStructure.find(x => x.path === currentFolder)
            if (!folder) {
              currentFileStructure.push({
                name: currentFolderName,
                type: 'folder',
                path: currentFolder,
                children: [],
              })
            }
            currentFileStructure = currentFileStructure.find(x => x.path === currentFolder)!.children!
          }
        }

        originalFiles = finalAnswerRef
      }
    })

    if (updateHappened) {
      setFiles(originalFiles)
      setSteps(steps => steps.map((s: Step) => ({ ...s, status: "completed" })))
    }
  }, [steps])

  useEffect(() => {
    const createMountStructure = (files: FileItem[]): Record<string, any> => {
      const mountStructure: Record<string, any> = {}

      const processFile = (file: FileItem, isRootFolder: boolean): any => {
        if (file.type === 'folder') {
          mountStructure[file.name] = {
            directory: file.children
              ? Object.fromEntries(
                  file.children.map(child => [child.name, processFile(child, false)])
                )
              : {}
          }
        } else if (file.type === 'file') {
          if (isRootFolder) {
            mountStructure[file.name] = {
              file: { contents: file.content || '' }
            }
          } else {
            return {
              file: { contents: file.content || '' }
            }
          }
        }
        return mountStructure[file.name]
      }

      files.forEach(file => processFile(file, true))
      return mountStructure
    }

    const mountStructure = createMountStructure(files)
    webcontainer?.mount(mountStructure)
  }, [files, webcontainer])

  useEffect(() => {
    const timer = setInterval(() => {
      setSteps(prevSteps => {
        const newSteps = [...prevSteps]
        const inProgressIndex = newSteps.findIndex(step => step.status === "in-progress")
        const pendingIndex = newSteps.findIndex(step => step.status === "pending")

        if (inProgressIndex !== -1) {
          newSteps[inProgressIndex].status = "completed"
          if (pendingIndex !== -1) {
            newSteps[pendingIndex].status = "in-progress"
          }
        }
        return newSteps
      })
      setProgress(prev => Math.min(prev + 15, 100))
    }, 3000)

    return () => clearInterval(timer)
  }, [])

  const completedSteps = steps.filter(step => step.status === "completed").length
  const totalSteps = steps.length

  // ── ONLY CSS CHANGED BELOW ──

  return (
    <div className="min-h-screen flex flex-col bg-[#050508] text-white">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&display=swap');
        .gen-root { font-family: 'Manrope', sans-serif; }

        .gen-header {
          background: rgba(5,5,8,0.85);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }

        .gen-back-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: rgba(255,255,255,0.45);
          font-size: 0.875rem;
          font-weight: 500;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          padding: 6px 14px;
          transition: all 0.2s ease;
          text-decoration: none;
          font-family: 'Manrope', sans-serif;
        }
        .gen-back-btn:hover {
          background: rgba(255,255,255,0.07);
          color: white;
          border-color: rgba(255,255,255,0.14);
        }

        .gen-action-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.8125rem;
          font-weight: 600;
          border-radius: 10px;
          padding: 6px 14px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: 'Manrope', sans-serif;
        }
        .gen-btn-outline {
          background: transparent;
          border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.5);
        }
        .gen-btn-outline:hover {
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.8);
          border-color: rgba(255,255,255,0.18);
        }
        .gen-btn-primary {
          background: linear-gradient(135deg, #3b82f6, #6366f1);
          border: none;
          color: white;
          position: relative;
          overflow: hidden;
        }
        .gen-btn-primary::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, #60a5fa, #818cf8);
          opacity: 0;
          transition: opacity 0.2s;
        }
        .gen-btn-primary:hover::after { opacity: 1; }
        .gen-btn-primary:hover { box-shadow: 0 0 24px rgba(99,102,241,0.4); }
        .gen-btn-primary > * { position: relative; z-index: 1; }

        /* Left panel */
        .gen-left-panel {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .gen-panel-header {
          padding: 20px 20px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }

        /* Progress bar override */
        .gen-progress-track {
          height: 4px;
          border-radius: 999px;
          background: rgba(255,255,255,0.06);
          overflow: hidden;
          margin-bottom: 6px;
        }
        .gen-progress-fill {
          height: 100%;
          border-radius: 999px;
          background: linear-gradient(90deg, #3b82f6, #8b5cf6);
          transition: width 0.5s ease;
        }

        /* Step item */
        .gen-step-item {
          display: flex;
          gap: 12px;
          padding: 10px 0;
          border-bottom: 1px solid rgba(255,255,255,0.03);
        }
        .gen-step-item:last-child { border-bottom: none; }

        /* Send area */
        .gen-send-textarea {
          width: 100%;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px;
          color: white;
          font-family: 'Manrope', sans-serif;
          font-size: 0.875rem;
          font-weight: 300;
          line-height: 1.6;
          padding: 12px 14px;
          resize: none;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
          box-sizing: border-box;
        }
        .gen-send-textarea:focus {
          border-color: rgba(99,102,241,0.45);
          box-shadow: 0 0 0 3px rgba(99,102,241,0.08);
        }
        .gen-send-textarea::placeholder { color: rgba(255,255,255,0.2); }

        .gen-send-btn {
          width: 100%;
          padding: 10px 16px;
          border-radius: 11px;
          border: none;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white;
          font-family: 'Manrope', sans-serif;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
          overflow: hidden;
        }
        .gen-send-btn::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, #818cf8, #a78bfa);
          opacity: 0;
          transition: opacity 0.2s;
        }
        .gen-send-btn:hover::after { opacity: 1; }
        .gen-send-btn:hover { box-shadow: 0 0 20px rgba(99,102,241,0.35); transform: translateY(-1px); }
        .gen-send-btn span { position: relative; z-index: 1; }

        /* Tabs */
        .gen-tabs-header {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 14px 14px 0 0;
          border-bottom: none;
          padding: 6px;
          display: flex;
          gap: 4px;
        }
        .gen-tab-trigger {
          flex: 1;
          padding: 7px 0;
          border-radius: 9px;
          border: none;
          background: transparent;
          color: rgba(255,255,255,0.4);
          font-family: 'Manrope', sans-serif;
          font-size: 0.8125rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          letter-spacing: 0.01em;
        }
        .gen-tab-trigger.active {
          background: rgba(99,102,241,0.15);
          color: #a5b4fc;
          border: 1px solid rgba(99,102,241,0.2);
        }
        .gen-tab-trigger:hover:not(.active) {
          background: rgba(255,255,255,0.04);
          color: rgba(255,255,255,0.7);
        }

        /* File explorer panel */
        .gen-explorer-panel {
          background: rgba(255,255,255,0.015);
          border-right: 1px solid rgba(255,255,255,0.05);
          display: flex;
          flex-direction: column;
        }
        .gen-explorer-header {
          padding: 14px 16px 10px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }

        /* Code panel */
        .gen-code-panel {
          background: #0a0a0f;
          display: flex;
          flex-direction: column;
        }
        .gen-file-tab {
          padding: 8px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          background: rgba(255,255,255,0.02);
          display: flex;
          align-items: center;
          gap: 8px;
        }

        /* Preview panel */
        .gen-preview-panel {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 0 0 14px 14px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .gen-preview-header {
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }

        /* Badge */
        .gen-badge {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 0.6875rem;
          font-weight: 700;
          font-family: 'Manrope', sans-serif;
          background: rgba(99,102,241,0.12);
          border: 1px solid rgba(99,102,241,0.2);
          color: #a5b4fc;
          letter-spacing: 0.02em;
        }

        /* Loading pulse */
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .gen-loading { animation: pulse 1.5s ease-in-out infinite; }
      `}</style>

      {/* ── Header ── */}
      <header className="gen-header gen-root sticky top-0 z-50">
        <div style={{ width: '100%', padding: '0 20px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Link href="/" className="gen-back-btn">
              <ArrowLeft size={14} />
              Back
            </Link>
            <div>
              <h1 style={{ fontFamily: 'Manrope,sans-serif', fontSize: '0.9375rem', fontWeight: 700, letterSpacing: '-0.01em', color: 'white', lineHeight: 1.2 }}>
                BlinkBuild
              </h1>
              <p style={{ fontFamily: 'Manrope,sans-serif', fontSize: '0.75rem', fontWeight: 300, color: 'rgba(255,255,255,0.35)', lineHeight: 1 }}>
                Generating your website...
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="gen-action-btn gen-btn-outline">
              <Download size={13} />
              Download
            </button>
            <button className="gen-action-btn gen-btn-primary">
              <Play size={13} />
              <span>Deploy</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="gen-root" style={{ width: '100%', padding: '16px 20px', flex: 1, display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, height: 'calc(100vh - 60px)', boxSizing: 'border-box', overflow: 'hidden' }}>

        {/* ── Left: Steps Panel ── */}
        <div className="gen-left-panel">
          {/* Panel header */}
          <div className="gen-panel-header">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontFamily: 'Manrope,sans-serif', fontSize: '0.8125rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Steps
              </span>
              <span className="gen-badge">{completedSteps}/{totalSteps}</span>
            </div>
            {/* Custom progress bar */}
            <div className="gen-progress-track">
              <div className="gen-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span style={{ fontFamily: 'Manrope,sans-serif', fontSize: '0.7rem', fontWeight: 400, color: 'rgba(255,255,255,0.2)' }}>
              {progress}% complete
            </span>
          </div>

          {/* Steps list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 8 }}>
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="gen-loading" style={{ height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.04)', animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
            ) : steps.length > 0 ? (
              <div>
                {steps.map(step => (
                  <div key={step.id} className="gen-step-item">
                    <div style={{ paddingTop: 1, flexShrink: 0 }}>
                      {step.status === "completed" ? (
                        <CheckCircle size={16} color="#34d399" />
                      ) : step.status === "in-progress" ? (
                        <Clock size={16} color="#60a5fa" style={{ animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <Circle size={16} color="rgba(255,255,255,0.15)" />
                      )}
                    </div>
                    <span style={{
                      fontFamily: 'Manrope,sans-serif',
                      fontSize: '0.8125rem',
                      fontWeight: step.status === 'completed' ? 400 : 500,
                      color: step.status === 'completed' ? 'rgba(255,255,255,0.3)' : step.status === 'in-progress' ? 'white' : 'rgba(255,255,255,0.55)',
                      lineHeight: 1.4,
                      textDecoration: step.status === 'completed' ? 'line-through' : 'none',
                    }}>
                      {step.title}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontFamily: 'Manrope,sans-serif', fontSize: '0.8125rem', color: 'rgba(255,255,255,0.2)', paddingTop: 8 }}>No steps yet</p>
            )}
          </div>

          {/* Send area */}
          <div style={{ padding: '12px 16px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea
              className="gen-send-textarea"
              placeholder="Ask for changes..."
              rows={3}
              value={userPrompt}
              onChange={e => setUserPrompt(e.target.value)}
            />
            <button
              className="gen-send-btn"
              onClick={async () => {
                if (!userPrompt.trim()) return
                const newMessage: PromptMessage = {
                  role: "user" as const,
                  content: userPrompt,
                }
                setLoading(true)
                const messages = [...llmMessages, newMessage]

                const stepsResponse = await fetch("/api/chat", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ messages }),
                })
                const newResult = await stepsResponse.json()
                console.log("Send response:", JSON.stringify(newResult, null, 2))

                const responseText: string =
                  newResult.response ?? newResult.content ?? newResult.message ?? ""

                setLlmMessages(x => [...x, newMessage, {
                  role: "model" as const,
                  content: responseText,
                }])

                if (responseText) {
                  setSteps(s => [...s, ...parseXml(responseText).map((x: Step) => ({
                    ...x,
                    id: nextId(),
                    status: "pending" as const,
                  }))])
                }

                setUserPrompt("")
                setLoading(false)
              }}
            >
              <span>Send →</span>
            </button>
          </div>
        </div>

        {/* ── Right: Editor + Preview ── */}
        <Tabs defaultValue="code" className="flex flex-col" style={{ minHeight: 0, height: '100%', overflow: 'hidden' }}>
          {/* Tab bar */}
          <div className="gen-tabs-header">
            <TabsList className="contents">
              <TabsTrigger
                value="code"
                className="gen-tab-trigger data-[state=active]:active"
              >
                Code
              </TabsTrigger>
              <TabsTrigger
                value="preview"
                className="gen-tab-trigger data-[state=active]:active"
              >
                Preview
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Code tab */}
          <TabsContent value="code" style={{ flex: 1, margin: 0, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', flex: 1, border: '1px solid rgba(255,255,255,0.06)', borderTop: 'none', borderRadius: '0 0 14px 14px', overflow: 'hidden', height: '100%' }}>

              {/* File Explorer */}
              <div className="gen-explorer-panel">
                <div className="gen-explorer-header">
                  <span style={{ fontFamily: 'Manrope,sans-serif', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>
                    Explorer
                  </span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                  {files.length > 0 ? (
                    <FileExplorer
                      files={files}
                      onFileSelect={setSelectedFile}
                    />
                  ) : (
                    <p style={{ fontFamily: 'Manrope,sans-serif', fontSize: '0.8rem', color: 'rgba(255,255,255,0.18)', padding: '8px 4px' }}>No files yet</p>
                  )}
                </div>
              </div>

              {/* Code Editor */}
              <div className="gen-code-panel">
                <div className="gen-file-tab">
                  <Code size={12} color="rgba(99,102,241,0.7)" />
                  <span style={{ fontFamily: 'Manrope,sans-serif', fontSize: '0.75rem', fontWeight: 500, color: 'rgba(255,255,255,0.4)' }}>
                    {selectedFile?.name || "Select a file"}
                  </span>
                </div>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <CodeEditor file={selectedFile} />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Preview tab */}
          <TabsContent value="preview" style={{ flex: 1, margin: 0, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <div className="gen-preview-panel" style={{ flex: 1, height: '100%' }}>
              <div className="gen-preview-header">
                <span style={{ fontFamily: 'Manrope,sans-serif', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>
                  Live Preview
                </span>
              </div>
              <div style={{ flex: 1, background: 'white', overflow: 'hidden', height: '100%' }}>
                {webcontainer && (
                  <PreviewFrame webContainer={webcontainer} files={files} />
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>

      </div>
    </div>
  )
}