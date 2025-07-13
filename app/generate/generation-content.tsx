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
import Editor from "@monaco-editor/react"
import { parseXml } from "../lib/steps"


interface PromptMessage {
  role: "user" | "assistant";
  content: string;
}

enum StepType{
  CreateFile,
  CreateFolder,
  EditFile,
  DeleteFile,
  RunScript
}
interface Step {
      id: number;
      title: string;
      description: string;
      type: StepType;
      status: 'pending' | 'in-progress' | 'completed';
      code?: string;
      path?: string;
}

interface FileNode {
  name: string
  type: "file" | "folder"
  children?: FileNode[]
  size?: string
  modified?: string
}

// const initialSteps: Step[] = [
//   {
//     id: 1,
//     title: "Analyzing Requirements",
//     description: "Processing your website description and extracting key requirements",
//     status: "completed",
//     duration: "2s",
//   },
//   {
//     id: 2,
//     title: "Generating Structure",
//     description: "Creating the website architecture and component structure",
//     status: "completed",
//     duration: "3s",
//   },
//   {
//     id: 3,
//     title: "Writing Components",
//     description: "Generating React components and page layouts",
//     status: "in-progress",
//   },
//   {
//     id: 4,
//     title: "Styling & Design",
//     description: "Applying styles and responsive design patterns",
//     status: "pending",
//   },
//   {
//     id: 5,
//     title: "Optimization",
//     description: "Optimizing performance and adding practices",
//     status: "pending",
//   },
//   {
//     id: 6,
//     title: "Final Review",
//     description: "Running final checks and preparing for deployment",
//     status: "pending",
//   },
// ]

const fileStructure: FileNode = {
  name: "my-website",
  type: "folder",
  children: [
    {
      name: "app",
      type: "folder",
      children: [
        { name: "layout.tsx", type: "file", size: "2.1 KB", modified: "2 min ago" },
        { name: "page.tsx", type: "file", size: "4.3 KB", modified: "1 min ago" },
        { name: "globals.css", type: "file", size: "1.8 KB", modified: "3 min ago" },
        {
          name: "components",
          type: "folder",
          children: [
            { name: "hero.tsx", type: "file", size: "3.2 KB", modified: "1 min ago" },
            { name: "about.tsx", type: "file", size: "2.8 KB", modified: "2 min ago" },
            { name: "gallery.tsx", type: "file", size: "4.1 KB", modified: "1 min ago" },
            { name: "contact.tsx", type: "file", size: "2.5 KB", modified: "2 min ago" },
          ],
        },
      ],
    },
    {
      name: "public",
      type: "folder",
      children: [
        { name: "favicon.ico", type: "file", size: "4.2 KB", modified: "5 min ago" },
        { name: "logo.png", type: "file", size: "12.3 KB", modified: "5 min ago" },
      ],
    },
    { name: "package.json", type: "file", size: "1.2 KB", modified: "5 min ago" },
    { name: "tailwind.config.js", type: "file", size: "0.8 KB", modified: "4 min ago" },
    { name: "next.config.js", type: "file", size: "0.3 KB", modified: "5 min ago" },
  ],
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

function FileTreeNode({
  node,
  level = 0,
  setSelectedFile,
  selectedFile,
}: { node: FileNode; level?: number; setSelectedFile: (file: string) => void; selectedFile: string }) {
  const [isOpen, setIsOpen] = useState(level < 2)

  const handleFileClick = (filePath: string) => {
    if (node.type === "file") {
      const fullPath = level === 0 ? node.name : `${getParentPath()}/${node.name}`
      setSelectedFile(fullPath)
    }
  }

  const getParentPath = () => {
    // This is a simplified version - in a real app you'd track the full path
    if (level === 1) return "app"
    if (level === 2) return "app/components"
    return ""
  }

  return (
    <div>
      <div
        className={`flex items-center gap-2 py-1 px-2 hover:bg-gray-700 rounded cursor-pointer ${
          level > 0 ? "ml-4" : ""
        } ${node.type === "file" && selectedFile.includes(node.name) ? "bg-gray-700" : ""}`}
        onClick={() => {
          if (node.type === "folder") {
            setIsOpen(!isOpen)
          } else {
            handleFileClick(node.name)
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
        {node.size && <span className="text-xs text-gray-500 ml-auto">{node.size}</span>}
      </div>
      {node.type === "folder" && isOpen && node.children && (
        <div>
          {node.children.map((child, index) => (
            <FileTreeNode
              key={index}
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

function getLanguageFromFile(filename: string): string {
  if (filename.endsWith(".tsx") || filename.endsWith(".jsx")) return "typescript"
  if (filename.endsWith(".ts")) return "typescript"
  if (filename.endsWith(".js")) return "javascript"
  if (filename.endsWith(".css")) return "css"
  if (filename.endsWith(".json")) return "json"
  if (filename.endsWith(".html")) return "html"
  return "plaintext"
}

export default function GenerationContent() {
  const searchParams = useSearchParams()
  const prompt = searchParams.get("prompt") || ""

  const [steps, setSteps] = useState<Step[]>([])
  const [progress, setProgress] = useState(40)
  const [loading, setLoading] = useState(true)


  const [selectedFile, setSelectedFile] = useState<string>("app/page.tsx")
  const [fileContents] = useState<Record<string, string>>({
    "app/layout.tsx": `import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'My Portfolio',
  description: 'A modern portfolio website',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}`,
    "app/page.tsx": `import Hero from './components/hero'
import About from './components/about'
import Gallery from './components/gallery'
import Contact from './components/contact'

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-900 text-white">
      <Hero />
      <About />
      <Gallery />
      <Contact />
    </main>
  )
}`,
    "app/globals.css": `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --foreground-rgb: 255, 255, 255;
  --background-start-rgb: 17, 24, 39;
  --background-end-rgb: 31, 41, 55;
}

body {
  color: rgb(var(--foreground-rgb));
  background: linear-gradient(
      to bottom,
      transparent,
      rgb(var(--background-end-rgb))
    )
    rgb(var(--background-start-rgb));
}`,
    "app/components/hero.tsx": `export default function Hero() {
  return (
    <section className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold mb-6 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          John Doe
        </h1>
        <p className="text-2xl text-gray-300 mb-8">
          Graphic Designer & Creative Artist
        </p>
        <button className="bg-purple-600 hover:bg-purple-700 px-8 py-3 rounded-lg font-semibold transition-colors">
          View My Work
        </button>
      </div>
    </section>
  )
}`,
    "app/components/about.tsx": `export default function About() {
  return (
    <section className="py-20 px-4">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-4xl font-bold mb-8 text-center">About Me</h2>
        <p className="text-lg text-gray-300 leading-relaxed">
          I'm a passionate graphic designer with over 5 years of experience 
          creating stunning visual experiences. I specialize in brand identity, 
          web design, and digital illustrations.
        </p>
      </div>
    </section>
  )
}`,
    "app/components/gallery.tsx": `export default function Gallery() {
  const projects = [
    { id: 1, title: "Brand Identity", image: "/project1.jpg" },
    { id: 2, title: "Web Design", image: "/project2.jpg" },
    { id: 3, title: "Digital Art", image: "/project3.jpg" },
  ]

  return (
    <section className="py-20 px-4 bg-gray-800">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-4xl font-bold mb-12 text-center">My Work</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {projects.map((project) => (
            <div key={project.id} className="bg-gray-700 rounded-lg overflow-hidden hover:transform hover:scale-105 transition-transform">
              <div className="h-48 bg-gradient-to-br from-purple-500 to-pink-500"></div>
              <div className="p-4">
                <h3 className="text-xl font-semibold">{project.title}</h3>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}`,
    "app/components/contact.tsx": `export default function Contact() {
  return (
    <section className="py-20 px-4">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-4xl font-bold mb-8 text-center">Get In Touch</h2>
        <form className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">Name</label>
            <input 
              type="text" 
              className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Email</label>
            <input 
              type="email" 
              className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Message</label>
            <textarea 
              rows={4}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
            ></textarea>
          </div>
          <button className="w-full bg-purple-600 hover:bg-purple-700 py-3 rounded-lg font-semibold transition-colors">
            Send Message
          </button>
        </form>
      </div>
    </section>
  )
}`,
    "package.json": `{
  "name": "my-portfolio",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.0.0",
    "react": "^18",
    "react-dom": "^18"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "autoprefixer": "^10",
    "eslint": "^8",
    "eslint-config-next": "14.0.0",
    "postcss": "^8",
    "tailwindcss": "^3",
    "typescript": "^5"
  }
}`,
    "tailwind.config.js": `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
}`,
    "next.config.js": `/** @type {import('next').NextConfig} */
const nextConfig = {}

module.exports = nextConfig`,
  })

  async function backendPrompt(prompt: string) {
    const res = await fetch("/api/template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: prompt }),
    });
    console.log("Response from /api/template:", res);
    const data = await res.json();
    console.log("Received data:", data);
    if (!data || !data.prompts || !data.prompts.length) {
      throw new Error("No prompts received from the server");
    }      
   // const promptai = data.prompts;
   const promptai = data.prompts; 
    console.log("Prompt AI:", promptai);
   
   const uiprompts = data.uiPrompts[0];
   const xml = parseXml(uiprompts)
   const stepsArray = Object.values(xml);
   setSteps(stepsArray);
    console.log("Parsed XML:", xml);
    console.log("Parsed steps:", steps);
    console.log("steps",steps[0])
    setLoading(false)
    const uiMessages: PromptMessage[] = (data.uiPrompts || []).map((p: string) => ({ 
      role: "user", 
      content: p 
    }));

    const messages = [
      ...promptai.map((p:string) => ({ role: "user", content: p })),
      ...uiMessages,
      { role: "user", content: prompt },
    ];
    const result = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });

    console.log("Result from /api/chat:", result);
      const dat = await result.json();
      console.log("Data from /api/chat:", dat);
  } 

  useEffect(() => {
    backendPrompt(prompt)
  }, [])

  // useEffect(() => {
  //   // Simulate step progression
  //   const timer = setInterval(() => {
  //     setSteps((prevSteps) => {
  //       const newSteps = [...prevSteps]
  //       const inProgressIndex = newSteps.findIndex((step) => step.status === "in-progress")
  //       const pendingIndex = newSteps.findIndex((step) => step.status === "pending")

  //       if (inProgressIndex !== -1) {
  //         newSteps[inProgressIndex].status = "completed"

  //         if (pendingIndex !== -1) {
  //           newSteps[pendingIndex].status = "in-progress"
  //         }
  //       }

  //       return newSteps
  //     })

  //     setProgress((prev) => Math.min(prev + 15, 100))
  //   }, 3000)

  //   return () => clearInterval(timer)
  // }, [])

  const completedSteps = steps.filter((step) => step.status === "completed").length
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
        <div className="grid lg:grid-cols-2 gap-6 h-[calc(100vh-140px)]">
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
            <CardContent className="flex-1">
            <ScrollArea className="h-full">
  {loading ? (
    <p className="text-gray-400">Loading steps...</p>
  ) : steps.length > 0 ? (
    <div className="space-y-4">
      {steps.map((step) => (
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
</CardContent>

          </Card>

          {/* Right Panel - Code Editor and Preview */}
          <div className="flex flex-col">
            <Tabs defaultValue="code" className="flex-1 flex flex-col">
              <div className="bg-gray-800 border border-gray-700 rounded-t-lg">
                <TabsList className="grid w-full grid-cols-2 bg-gray-800 border-b border-gray-700">
                  <TabsTrigger value="code" className="data-[state=active]:bg-gray-700 text-gray-300">
                    Code
                  </TabsTrigger>
                  <TabsTrigger value="preview" className="data-[state=active]:bg-gray-700 text-gray-300">
                    Preview
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="code" className="flex-1 mt-0">
                <div className="grid grid-cols-5 h-[calc(100vh-200px)]">
                  {/* File Explorer */}
                  <Card className="col-span-2 bg-gray-800 border-gray-700 rounded-none border-r">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg text-white">Project Files</CardTitle>
                      <p className="text-sm text-gray-400">Click on files to view code</p>
                    </CardHeader>
                    <CardContent className="flex-1">
                      <ScrollArea className="h-full">
                        <FileTreeNode
                          node={fileStructure}
                          setSelectedFile={setSelectedFile}
                          selectedFile={selectedFile}
                        />
                      </ScrollArea>
                    </CardContent>
                  </Card>

                  {/* Monaco Editor */}
                  <div className="col-span-3 bg-gray-900 border-gray-700">
                    <div className="h-full flex flex-col">
                      <div className="bg-gray-800 px-4 py-2 border-b border-gray-700">
                        <span className="text-sm text-gray-300">{selectedFile}</span>
                      </div>
                      <div className="flex-1">
                        <Editor
                          height="100%"
                          language={getLanguageFromFile(selectedFile)}
                          theme="vs-dark"
                          value={fileContents[selectedFile] || "// File content loading..."}
                          options={{
                            readOnly: true,
                            minimap: { enabled: false },
                            fontSize: 14,
                            lineNumbers: "on",
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                          }}
                        />
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
                      <iframe
                        src="data:text/html;charset=utf-8,%3C!DOCTYPE%20html%3E%3Chtml%3E%3Chead%3E%3Cstyle%3Ebody%7Bmargin%3A0%3Bfont-family%3A-apple-system%2CBlinkMacSystemFont%2C%27Segoe%20UI%27%2CRoboto%2Csans-serif%3Bbackground%3Alinear-gradient(135deg%2C%23667eea%200%25%2C%23764ba2%20100%25)%3Bcolor%3Awhite%3B%7D.hero%7Bheight%3A100vh%3Bdisplay%3Aflex%3Balign-items%3Acenter%3Bjustify-content%3Acenter%3Btext-align%3Acenter%3B%7D.hero%20h1%7Bfont-size%3A4rem%3Bmargin-bottom%3A1rem%3Bbackground%3Alinear-gradient(45deg%2C%23ff6b6b%2C%234ecdc4)%3B-webkit-background-clip%3Atext%3B-webkit-text-fill-color%3Atransparent%3B%7D.hero%20p%7Bfont-size%3A1.5rem%3Bmargin-bottom%3A2rem%3Bopacity%3A0.9%3B%7D.btn%7Bbackground%3A%23ff6b6b%3Bcolor%3Awhite%3Bpadding%3A12px%2024px%3Bborder%3Anone%3Bborder-radius%3A8px%3Bfont-size%3A1.1rem%3Bcursor%3Apointer%3Btransition%3Atransform%200.2s%3B%7D.btn%3Ahover%7Btransform%3AtranslateY(-2px)%3B%7D%3C/style%3E%3C/head%3E%3Cbody%3E%3Cdiv%20class%3D%22hero%22%3E%3Cdiv%3E%3Ch1%3EJohn%20Doe%3C/h1%3E%3Cp%3EGraphic%20Designer%20%26%20Creative%20Artist%3C/p%3E%3Cbutton%20class%3D%22btn%22%3EView%20My%20Work%3C/button%3E%3C/div%3E%3C/div%3E%3C/body%3E%3C/html%3E"
                        className="w-full h-full border-0"
                        title="Website Preview"
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Prompt Display */}
        {/* {prompt && (
          <Card className="mt-6 bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg text-white">Your Requirements</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-300 leading-relaxed">{prompt}</p>
            </CardContent>
          </Card>
        )} */}
      </div>
    </div>
  )
}
