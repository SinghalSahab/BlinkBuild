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


        <pre className="whitespace-pre-wrap text-sm text-white">
{JSON.stringify(parseXml(`"Here is an artifact that contains all files of the project visible to you.
Consider the contents of ALL files in the project.

<boltArtifact id="project-import" title="Project Files"><boltAction type="file" filePath="eslint.config.js">import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  }
);
</boltAction><boltAction type="file" filePath="index.html"><!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + React + TS</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
</boltAction><boltAction type="file" filePath="package.json">{
  "name": "vite-react-typescript-starter",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "lucide-react": "^0.344.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@eslint/js": "^9.9.1",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.18",
    "eslint": "^9.9.1",
    "eslint-plugin-react-hooks": "^5.1.0-rc.0",
    "eslint-plugin-react-refresh": "^0.4.11",
    "globals": "^15.9.0",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.5.3",
    "typescript-eslint": "^8.3.0",
    "vite": "^5.4.2"
  }
}
</boltAction><boltAction type="file" filePath="postcss.config.js">export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
</boltAction><boltAction type="file" filePath="tailwind.config.js">/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
</boltAction><boltAction type="file" filePath="tsconfig.app.json">{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",

    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
</boltAction><boltAction type="file" filePath="tsconfig.json">{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
</boltAction><boltAction type="file" filePath="tsconfig.node.json">{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,

    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["vite.config.ts"]
}
</boltAction><boltAction type="file" filePath="vite.config.ts">import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
</boltAction><boltAction type="file" filePath="src/App.tsx">import React from 'react';

function App() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <p>Start prompting (or editing) to see magic happen :)</p>
    </div>
  );
}

export default App;
</boltAction><boltAction type="file" filePath="src/index.css">@tailwind base;
@tailwind components;
@tailwind utilities;
</boltAction><boltAction type="file" filePath="src/main.tsx">import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
</boltAction><boltAction type="file" filePath="src/vite-env.d.ts">/// <reference types="vite/client" />
</boltAction></boltArtifact>

Here is a list of files that exist on the file system but are not being shown to you:

  - .gitignore
  - package-lock.json
"`), null, 2)}
        </pre>


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
