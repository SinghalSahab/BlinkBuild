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
  Settings,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Share2,
} from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useState, useEffect, useRef } from "react"
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

// ── Download helper ──
function downloadFilesAsZip(files: FileItem[]) {
  // Flatten all files to path -> content
  const allFiles: { path: string; content: string }[] = []
  const flatten = (items: FileItem[], prefix = "") => {
    items.forEach(item => {
      if (item.type === "file") {
        allFiles.push({ path: prefix + item.name, content: item.content || "" })
      } else if (item.type === "folder" && item.children) {
        flatten(item.children, prefix + item.name + "/")
      }
    })
  }
  flatten(files)

  // Build a simple text blob of all files (no JSZip dep needed)
  const content = allFiles.map(f =>
    `${"=".repeat(60)}\nFILE: ${f.path}\n${"=".repeat(60)}\n${f.content}`
  ).join("\n\n")

  const blob = new Blob([content], { type: "text/plain" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "blinkbuild-project.txt"
  a.click()
  URL.revokeObjectURL(url)
}

export default function GenerationContent() {
  const searchParams = useSearchParams()
  const prompt = searchParams.get("prompt") || ""
  const webcontainer = useWebContainer()

  const [steps, setSteps] = useState<Step[]>([])
  const [visibleSteps, setVisibleSteps] = useState<Step[]>([])  // ✅ steps revealed one-by-one
  const [progress, setProgress] = useState(0)
  const [loading, setLoading] = useState(true)
  const [files, setFiles] = useState<FileItem[]>([])
  const [userPrompt, setUserPrompt] = useState<string>("")
  const [llmMessages, setLlmMessages] = useState<PromptMessage[]>([])
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null)
  const [isReady, setIsReady] = useState(false)           // ✅ "site is ready" banner
  const [templateDone, setTemplateDone] = useState(false) // ✅ phase tracking
  const [chatDone, setChatDone] = useState(false)         // ✅ phase tracking
  const [headerStatus, setHeaderStatus] = useState("Generating your website...")
  const stepsEndRef = useRef<HTMLDivElement>(null)
  const revealQueueRef = useRef<Step[]>([])
  const revealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ✅ Gradually reveal steps one-by-one from queue
  const startRevealQueue = () => {
    if (revealTimerRef.current) return
    revealTimerRef.current = setInterval(() => {
      if (revealQueueRef.current.length === 0) {
        if (revealTimerRef.current) clearInterval(revealTimerRef.current)
        revealTimerRef.current = null
        return
      }
      const next = revealQueueRef.current.shift()!
      setVisibleSteps(v => [...v, next])
      stepsEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, 350)
  }

  const enqueueSteps = (newSteps: Step[]) => {
    revealQueueRef.current.push(...newSteps)
    startRevealQueue()
  }

  // ── CORE LOGIC (unchanged) ──

  async function backendPrompt(prompt: string) {
    setHeaderStatus("Analyzing your prompt...")
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

    const templateSteps = parseXml(uiprompts).map((x: Step) => ({
      ...x,
      id: nextId(),
      status: "pending" as const,
    }))
    setSteps(templateSteps)
    enqueueSteps(templateSteps)
    setTemplateDone(true)
    setHeaderStatus("Building your website...")

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
      const chatSteps = parseXml(chatResponse).map((x: Step) => ({
        ...x,
        id: nextId(),
        status: "pending" as const,
      }))
      setSteps(s => [...s, ...chatSteps])
      enqueueSteps(chatSteps)
    }

    setLlmMessages([
      ...promptai.map((p: string) => ({ role: "user" as const, content: p })),
      ...uiMessages,
      { role: "user" as const, content: prompt },
      { role: "model" as const, content: chatResponse },
    ])

    setChatDone(true)
    setLoading(false)
    setHeaderStatus("Your website is ready!")
  }

  useEffect(() => {
    backendPrompt(prompt)
    return () => {
      if (revealTimerRef.current) clearInterval(revealTimerRef.current)
    }
  }, [])

  // ✅ Show ready banner when both done and all steps visible
  useEffect(() => {
    if (chatDone && !loading && visibleSteps.length > 0) {
      const t = setTimeout(() => setIsReady(true), 800)
      return () => clearTimeout(t)
    }
  }, [chatDone, loading, visibleSteps.length])

  // ── Process pending steps into file structure (unchanged) ──
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
      setVisibleSteps(v => v.map(s => ({ ...s, status: "completed" })))
    }
  }, [steps])

  // ── Mount files into WebContainer (unchanged) ──
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

  // ✅ Progress tied to actual visible steps completion — stops at 100 only when done
  useEffect(() => {
    if (visibleSteps.length === 0) return
    const completed = visibleSteps.filter(s => s.status === "completed").length
    const total = visibleSteps.length
    const pct = chatDone
      ? Math.round((completed / total) * 100)
      : Math.min(Math.round((completed / total) * 85), 85) // cap at 85 until chat done
    setProgress(pct)
  }, [visibleSteps, chatDone])

  const completedSteps = visibleSteps.filter(step => step.status === "completed").length
  const totalSteps = visibleSteps.length

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
        .gen-btn-green {
          background: linear-gradient(135deg, #059669, #10b981);
          border: none;
          color: white;
          position: relative;
          overflow: hidden;
        }
        .gen-btn-green::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, #10b981, #34d399);
          opacity: 0;
          transition: opacity 0.2s;
        }
        .gen-btn-green:hover::after { opacity: 1; }
        .gen-btn-green:hover { box-shadow: 0 0 24px rgba(16,185,129,0.35); }
        .gen-btn-green > * { position: relative; z-index: 1; }

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
          flex-shrink: 0;
        }

        /* Progress bar */
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
          transition: width 0.6s cubic-bezier(0.4,0,0.2,1);
        }

        /* Steps scroll container — fixed height, scrollable */
        .gen-steps-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 12px 16px;
          min-height: 0;
          max-height: 100%;
          scroll-behavior: smooth;
        }
        .gen-steps-scroll::-webkit-scrollbar { width: 4px; }
        .gen-steps-scroll::-webkit-scrollbar-track { background: transparent; }
        .gen-steps-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 999px; }

        /* Step item with entrance animation */
        .gen-step-item {
          display: flex;
          gap: 12px;
          padding: 10px 0;
          border-bottom: 1px solid rgba(255,255,255,0.03);
          opacity: 0;
          transform: translateY(8px);
          animation: stepIn 0.35s ease forwards;
        }
        .gen-step-item:last-child { border-bottom: none; }
        @keyframes stepIn {
          to { opacity: 1; transform: translateY(0); }
        }

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
          flex-shrink: 0;
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
          overflow: hidden;
        }
        .gen-explorer-header {
          padding: 14px 16px 10px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          flex-shrink: 0;
        }
        .gen-explorer-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
        }
        .gen-explorer-scroll::-webkit-scrollbar { width: 3px; }
        .gen-explorer-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 999px; }

        /* Code panel */
        .gen-code-panel {
          background: #0a0a0f;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .gen-file-tab {
          padding: 8px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          background: rgba(255,255,255,0.02);
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
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
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          flex-shrink: 0;
        }

        /* Preview loading screen */
        .gen-preview-loading {
          flex: 1;
          background: #0d0d14;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 20px;
        }
        .gen-preview-spinner {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          border: 2px solid rgba(99,102,241,0.15);
          border-top-color: #6366f1;
          animation: spin 0.9s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .gen-preview-dots {
          display: flex;
          gap: 6px;
        }
        .gen-preview-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: rgba(99,102,241,0.4);
          animation: dotPulse 1.4s ease-in-out infinite;
        }
        .gen-preview-dot:nth-child(2) { animation-delay: 0.2s; }
        .gen-preview-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes dotPulse {
          0%,80%,100% { transform: scale(0.7); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
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

        /* Loading skeleton */
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .gen-loading { animation: pulse 1.5s ease-in-out infinite; }

        /* ✅ Site Ready Banner */
        .gen-ready-overlay {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(5,5,8,0.85);
          backdrop-filter: blur(12px);
          animation: overlayIn 0.4s ease forwards;
        }
        @keyframes overlayIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .gen-ready-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(99,102,241,0.3);
          border-radius: 24px;
          padding: 48px 56px;
          text-align: center;
          max-width: 480px;
          width: 90%;
          animation: cardIn 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards;
          position: relative;
          overflow: hidden;
        }
        .gen-ready-card::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.12) 0%, transparent 70%);
          pointer-events: none;
        }
        @keyframes cardIn {
          from { opacity: 0; transform: scale(0.85) translateY(20px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .gen-ready-icon {
          width: 72px; height: 72px;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2));
          border: 1px solid rgba(99,102,241,0.3);
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 24px;
          animation: iconPop 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.2s both;
        }
        @keyframes iconPop {
          from { transform: scale(0); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .gen-ready-title {
          font-family: 'Manrope', sans-serif;
          font-size: 1.75rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          margin-bottom: 10px;
          background: linear-gradient(135deg, #60a5fa, #818cf8, #c084fc);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: fadeUp 0.5s ease 0.3s both;
        }
        .gen-ready-sub {
          font-family: 'Manrope', sans-serif;
          font-size: 0.9375rem;
          font-weight: 300;
          color: rgba(255,255,255,0.4);
          margin-bottom: 32px;
          animation: fadeUp 0.5s ease 0.4s both;
        }
        .gen-ready-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 12px 28px;
          border-radius: 14px;
          border: none;
          background: linear-gradient(135deg, #3b82f6, #6366f1, #8b5cf6);
          color: white;
          font-family: 'Manrope', sans-serif;
          font-size: 0.9375rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          animation: fadeUp 0.5s ease 0.5s both;
        }
        .gen-ready-btn:hover { transform: translateY(-2px); box-shadow: 0 0 32px rgba(99,102,241,0.4); }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Sparkle particles on ready card */
        .gen-sparkle {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          animation: sparkleFly 2s ease-out forwards;
        }
        @keyframes sparkleFly {
          0% { opacity: 1; transform: scale(1) translate(0,0); }
          100% { opacity: 0; transform: scale(0) translate(var(--tx), var(--ty)); }
        }

        /* Phase indicator */
        .gen-phase {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 0.6875rem;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 999px;
          font-family: 'Manrope', sans-serif;
        }
        .gen-phase-active {
          background: rgba(99,102,241,0.12);
          border: 1px solid rgba(99,102,241,0.2);
          color: #a5b4fc;
        }
        .gen-phase-done {
          background: rgba(16,185,129,0.1);
          border: 1px solid rgba(16,185,129,0.2);
          color: #34d399;
        }
        .gen-phase-waiting {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
          color: rgba(255,255,255,0.25);
        }
        .gen-phase-dot {
          width: 5px; height: 5px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .gen-phase-dot-active { background: #818cf8; box-shadow: 0 0 6px #818cf8; animation: pulse 1s infinite; }
        .gen-phase-dot-done { background: #34d399; }
        .gen-phase-dot-waiting { background: rgba(255,255,255,0.15); }
      `}</style>

      {/* ✅ Site Ready Overlay */}
      {isReady && (
        <div className="gen-ready-overlay" onClick={() => setIsReady(false)}>
          <div className="gen-ready-card" onClick={e => e.stopPropagation()}>
            <div className="gen-ready-icon">
              <Sparkles size={32} color="#a78bfa" />
            </div>
            <div className="gen-ready-title">Your site is ready!</div>
            <p className="gen-ready-sub">
              All {totalSteps} files generated and mounted. Preview it live or download the source.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="gen-ready-btn" onClick={() => setIsReady(false)}>
                <span>View Site →</span>
              </button>
              <button
                className="gen-ready-btn"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                onClick={() => { downloadFilesAsZip(files); setIsReady(false) }}
              >
                <Download size={15} />
                <span>Download</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
              <p style={{ fontFamily: 'Manrope,sans-serif', fontSize: '0.7rem', fontWeight: 300, color: loading ? 'rgba(99,162,241,0.7)' : 'rgba(52,211,153,0.8)', lineHeight: 1, transition: 'color 0.5s ease' }}>
                {headerStatus}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="gen-action-btn gen-btn-outline"
              onClick={() => downloadFilesAsZip(files)}
              disabled={files.length === 0}
              style={{ opacity: files.length === 0 ? 0.4 : 1 }}
            >
              <Download size={13} />
              Download
            </button>
            <button
              className="gen-action-btn gen-btn-green"
              onClick={() => setIsReady(true)}
              disabled={loading}
              style={{ opacity: loading ? 0.4 : 1 }}
            >
              <Share2 size={13} />
              <span>Share</span>
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontFamily: 'Manrope,sans-serif', fontSize: '0.8125rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Steps
              </span>
              <span className="gen-badge">{completedSteps}/{totalSteps}</span>
            </div>

            {/* Phase indicators */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              <span className={`gen-phase ${templateDone ? 'gen-phase-done' : 'gen-phase-active'}`}>
                <span className={`gen-phase-dot ${templateDone ? 'gen-phase-dot-done' : 'gen-phase-dot-active'}`} />
                Template
              </span>
              <span className={`gen-phase ${chatDone ? 'gen-phase-done' : templateDone ? 'gen-phase-active' : 'gen-phase-waiting'}`}>
                <span className={`gen-phase-dot ${chatDone ? 'gen-phase-dot-done' : templateDone ? 'gen-phase-dot-active' : 'gen-phase-dot-waiting'}`} />
                AI Generation
              </span>
            </div>

            {/* Progress bar */}
            <div className="gen-progress-track">
              <div className="gen-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span style={{ fontFamily: 'Manrope,sans-serif', fontSize: '0.7rem', fontWeight: 400, color: 'rgba(255,255,255,0.2)' }}>
              {progress}% complete
            </span>
          </div>

          {/* ✅ Scrollable steps list — fixed height window */}
          <div className="gen-steps-scroll">
            {loading && visibleSteps.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 8 }}>
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="gen-loading" style={{ height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.04)', animationDelay: `${i * 0.12}s` }} />
                ))}
              </div>
            ) : visibleSteps.length > 0 ? (
              <div>
                {visibleSteps.map((step, i) => (
                  <div key={step.id} className="gen-step-item" style={{ animationDelay: `${i * 0.02}s` }}>
                    <div style={{ paddingTop: 1, flexShrink: 0 }}>
                      {step.status === "completed" ? (
                        <CheckCircle size={15} color="#34d399" />
                      ) : step.status === "in-progress" ? (
                        <Clock size={15} color="#60a5fa" style={{ animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <Circle size={15} color="rgba(255,255,255,0.12)" />
                      )}
                    </div>
                    <span style={{
                      fontFamily: 'Manrope,sans-serif',
                      fontSize: '0.8rem',
                      fontWeight: step.status === 'in-progress' ? 600 : 400,
                      color: step.status === 'completed'
                        ? 'rgba(255,255,255,0.25)'
                        : step.status === 'in-progress'
                        ? 'white'
                        : 'rgba(255,255,255,0.5)',
                      lineHeight: 1.4,
                      textDecoration: step.status === 'completed' ? 'line-through' : 'none',
                      transition: 'color 0.3s, text-decoration 0.3s',
                    }}>
                      {step.title}
                    </span>
                  </div>
                ))}
                <div ref={stepsEndRef} />
              </div>
            ) : (
              <p style={{ fontFamily: 'Manrope,sans-serif', fontSize: '0.8125rem', color: 'rgba(255,255,255,0.2)', paddingTop: 8 }}>No steps yet</p>
            )}
          </div>

          {/* Send area */}
          <div style={{ padding: '12px 16px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
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
                setIsReady(false)
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
                  const newSteps = parseXml(responseText).map((x: Step) => ({
                    ...x,
                    id: nextId(),
                    status: "pending" as const,
                  }))
                  setSteps(s => [...s, ...newSteps])
                  enqueueSteps(newSteps)
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
              <TabsTrigger value="code" className="gen-tab-trigger data-[state=active]:active">
                Code
              </TabsTrigger>
              <TabsTrigger value="preview" className="gen-tab-trigger data-[state=active]:active">
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
                <div className="gen-explorer-scroll">
                  {files.length > 0 ? (
                    <FileExplorer files={files} onFileSelect={setSelectedFile} />
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
                <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
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

              {/* ✅ Dark loading screen instead of white blank */}
              {loading || !webcontainer ? (
                <div className="gen-preview-loading">
                  <div style={{ position: 'relative' }}>
                    <div className="gen-preview-spinner" />
                    <div style={{
                      position: 'absolute', inset: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <div style={{ width: 18, height: 18, borderRadius: 5, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' }} />
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontFamily: 'Manrope,sans-serif', fontSize: '0.9375rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: 6 }}>
                      {loading ? 'Building your site...' : 'Starting Dev Server...'}
                    </p>
                    <p style={{ fontFamily: 'Manrope,sans-serif', fontSize: '0.8rem', fontWeight: 300, color: 'rgba(255,255,255,0.25)' }}>
                      {loading ? 'Generating files and dependencies' : 'This may take a few seconds'}
                    </p>
                  </div>
                  <div className="gen-preview-dots">
                    <div className="gen-preview-dot" />
                    <div className="gen-preview-dot" />
                    <div className="gen-preview-dot" />
                  </div>
                </div>
              ) : (
                <div style={{ flex: 1, overflow: 'hidden', height: '100%' }}>
                  <PreviewFrame webContainer={webcontainer} files={files} />
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

      </div>
    </div>
  )
}