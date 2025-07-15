"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Code, Sparkles, Zap } from "lucide-react";
import { generateWebsite } from "./actions";
import { parseXml } from "./lib/steps";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white">
      {/* Header */}
      <header className="w-full py-4 border-b border-gray-800 bg-gray-900">
        <div className="container mx-auto px-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[#00FF88]">Hopz</h1>
          <nav className="flex gap-4">
            <a href="#features" className="text-[#00FF88] hover:underline">
              Features
            </a>
            <a href="#contact" className="text-[#00FF88] hover:underline">
              Contact
            </a>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-4 py-16">
        <section className="text-center mb-16">
          <h2 className="text-5xl font-bold text-[#00FF88] mb-6">Welcome to Hopz</h2>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            Redefining modern web design with vibrant neon accents and a sleek, minimalistic layout.
          </p>
        </section>

        {/* Main Form */}
        <div className="max-w-2xl mx-auto">
          <Card className="shadow-lg border-gray-800 bg-gray-900 backdrop-blur-md">
            <CardHeader className="text-center">
              <CardTitle className="text-3xl text-[#00FF88]">What website do you want to create?</CardTitle>
              <CardDescription className="text-base text-gray-400">
                Describe your website idea in detail. Include the purpose, style, features, and any specific
                requirements.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={generateWebsite} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="prompt" className="text-base font-medium text-[#00FF88]">
                    Describe Your Website
                  </Label>
                  <Textarea
                    id="prompt"
                    name="prompt"
                    placeholder="e.g., Create a modern portfolio website for a graphic designer. Include a hero section with my name and tagline, a gallery of my work, an about section, and a contact form. Use a clean, minimalist design with a dark theme and neon green accents."
                    className="min-h-32 text-base resize-none bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
                    required
                  />
                </div>

                <Button type="submit" size="lg" className="w-full h-12 text-base bg-[#00FF88] hover:bg-[#00CC70]">
                  <Zap className="mr-2 h-5 w-5" />
                  Generate My Website
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>


       

        {/* Features */}
        <div id="features" className="grid md:grid-cols-3 gap-8 mt-20 max-w-4xl mx-auto">
          <div className="text-center">
            <div className="bg-[#00FF88]/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Sparkles className="h-8 w-8 text-[#00FF88]" />
            </div>
            <h3 className="text-xl font-semibold mb-2 text-[#00FF88]">AI-Powered</h3>
            <p className="text-gray-300">Advanced AI understands your requirements and generates optimized code.</p>
          </div>
          <div className="text-center">
            <div className="bg-green-900/50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Zap className="h-8 w-8 text-green-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2 text-[#00FF88]">Lightning Fast</h3>
            <p className="text-gray-300">Get your website generated and ready to deploy in seconds.</p>
          </div>
          <div className="text-center">
            <div className="bg-purple-900/50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Code className="h-8 w-8 text-purple-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2 text-[#00FF88]">Production Ready</h3>
            <p className="text-gray-300">Clean, optimized code that's ready for deployment.</p>
          </div>
        </div>
      </main>

      <footer className="w-full py-4 border-t border-gray-800 bg-gray-900">
        <div className="container mx-auto px-4 text-center">
          <p className="text-gray-500">© 2025 Hopz. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
