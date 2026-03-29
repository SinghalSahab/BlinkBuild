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

//  Module-level — never resets on re-render
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
  if (type === "folder") return <Folder className="h-4 w-4 text-[#00FF88]" />
  if (name.endsWith(".tsx") || name.endsWith(".ts")) return <Code className="h-4 w-4 text-[#00FF88]" />
  if (name.endsWith(".css")) return <Settings className="h-4 w-4 text-pink-400" />
  if (name.endsWith(".json")) return <FileText className="h-4 w-4 text-yellow-400" />
  if (name.endsWith(".js")) return <Code className="h-4 w-4 text-yellow-400" />
  if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".ico"))
    return <ImageIcon className="h-4 w-4 text-green-400" />
  return <FileText className="h-4 w-4 text-gray-400" />
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
        className={`flex items-center gap-2 py-1 px-2 hover:bg-gray-700 rounded cursor-pointer ${
          level > 0 ? "ml-4" : ""
        } ${node.type === "file" && selectedFile.includes(node.name) ? "bg-gray-700" : ""}`}
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
              <ChevronDown className="h-3 w-3 text-gray-400 mr-1" />
            ) : (
              <ChevronRight className="h-3 w-3 text-gray-400 mr-1" />
            )}
          </div>
        )}
        {node.type === "folder" ? (
          isOpen ? (
            <FolderOpen className="h-4 w-4 text-[#00FF88]" />
          ) : (
            <Folder className="h-4 w-4 text-[#00FF88]" />
          )
        ) : (
          <div className="ml-4">
            <FileIcon type={node.type} name={node.name} />
          </div>
        )}
        <span className="text-sm font-medium text-gray-200">{node.name}</span>
        {node.type === "file" && (
          <Badge className="ml-auto bg-gray-800 text-gray-400 text-xs">
            {getLanguageFromFile(node.name)}
          </Badge>
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

    //  Set initial steps from uiPrompts (the base template files)
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

    //  Append LLM generated steps with unique ids
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

  //  Process pending steps into file structure
  useEffect(() => {
    const pendingSteps = steps.filter(({ status }) => status === "pending")
    if (pendingSteps.length === 0) return

    let originalFiles = [...files]
    let updateHappened = false

    pendingSteps.forEach(step => {
      updateHappened = true
      if (step?.type === StepType.CreateFile) {
        //  Only strip leading slash — src/ is valid for Vite projects
        let parsedPath = step.path
          ?.replace(/^\//, "")
          .split("/") ?? []

        //  Skip empty paths
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

  //  Mount files into WebContainer
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

  //  Step progression animation — empty dep array, runs once
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

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm" className="text-gray-300 hover:text-white hover:bg-gray-700">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-semibold text-white">My Website</h1>
                <p className="text-sm text-gray-400">Generating your website...</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-gray-600 text-gray-300 hover:bg-gray-700 bg-transparent"
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                <Play className="h-4 w-4 mr-2" />
                Deploy
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-[27%_73%] gap-6 h-[calc(100vh-140px)]">
          {/* Left Panel - Steps */}
          <Card className="flex flex-col bg-gray-800 border-gray-700">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg text-white">Generation Steps</CardTitle>
                <Badge variant="secondary" className="bg-gray-700 text-gray-300">
                  {completedSteps}/{totalSteps} Complete
                </Badge>
              </div>
              <div className="space-y-2">
                <Progress value={progress} className="h-2" />
                <p className="text-sm text-gray-400">{progress}% complete</p>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <ScrollArea className="flex-1">
                {loading ? (
                  <p className="text-gray-400">Loading steps...</p>
                ) : steps.length > 0 ? (
                  <div className="space-y-4">
                    {steps.map(step => (
                      <div key={step.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          {step.status === "completed" ? (
                            <CheckCircle className="h-6 w-6 text-green-400" />
                          ) : step.status === "in-progress" ? (
                            <Clock className="h-6 w-6 text-blue-400 animate-spin" />
                          ) : (
                            <Circle className="h-6 w-6 text-gray-600" />
                          )}
                        </div>
                        <div className="flex-1 pb-4">
                          <h3 className="font-medium text-white">{step.title}</h3>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400">No steps to show</p>
                )}
              </ScrollArea>

              {/*  Send prompt area */}
              <div className="mt-4 flex flex-col gap-2">
                <textarea
                  className="w-full p-3 rounded-lg border border-gray-600 bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none shadow-sm"
                  placeholder="Ask for changes..."
                  rows={3}
                  value={userPrompt}
                  onChange={e => setUserPrompt(e.target.value)}
                />
                <button
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
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Send
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Right Panel */}
          <div className="flex flex-col">
            <Tabs defaultValue="code" className="flex-1 flex flex-col">
              <div className="bg-gray-800 border border-gray-700 rounded-t-lg">
                <TabsList className="grid w-full gap-2 grid-cols-2 bg-gray-800 border-b border-gray-700">
                  <TabsTrigger value="code" className="data-[state=active]:bg-gray-700 text-gray-300">
                    Code
                  </TabsTrigger>
                  <TabsTrigger value="preview" className="data-[state=active]:bg-gray-700 text-gray-300">
                    Preview
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="code" className="flex-1 mt-0">
                <div className="grid grid-cols-10 h-[calc(100vh-200px)]">
                  {/* File Explorer */}
                  <Card className="col-span-3 bg-gray-800 border-gray-700 rounded-none border-r">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg text-white">File Explorer</CardTitle>
                      <p className="text-sm text-gray-400">Browse your project files</p>
                    </CardHeader>
                    <CardContent className="flex-1">
                      <ScrollArea className="h-full">
                        {files.length > 0 ? (
                          <FileExplorer
                            files={files}
                            onFileSelect={setSelectedFile}
                          />
                        ) : (
                          <p className="text-gray-400">No files available</p>
                        )}
                      </ScrollArea>
                    </CardContent>
                  </Card>

                  {/* Code Editor */}
                  <div className="col-span-7 bg-gray-900 border-gray-700">
                    <div className="h-full flex flex-col">
                      <div className="bg-gray-800 px-4 py-2 border-b border-gray-700">
                        <span className="text-sm text-gray-300">
                          {selectedFile?.name || "No file selected"}
                        </span>
                      </div>
                      <div className="flex-1 min-h-[400px]">
                        <CodeEditor file={selectedFile} />
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="preview" className="flex-1 mt-0">
                <Card className="h-[calc(100vh-200px)] bg-gray-800 border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-lg text-white">Website Preview</CardTitle>
                    <p className="text-sm text-gray-400">Live preview of your generated website</p>
                  </CardHeader>
                  <CardContent className="flex-1 p-0">
                    <div className="h-full bg-white rounded-lg overflow-hidden">
                      {webcontainer && (
                        <PreviewFrame webContainer={webcontainer} files={files} />
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  )
}