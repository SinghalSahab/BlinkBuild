import { WebContainer } from '@webcontainer/api';
import React, { useEffect, useState } from 'react';

interface PreviewFrameProps {
  files: any[];
  webContainer: WebContainer;
}

export function PreviewFrame({ files, webContainer }: PreviewFrameProps) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    const startServer = async () => {
      console.log("Installing dependencies...");
      const installProcess = await webContainer.spawn('npm', ['install']);

      // Wait for install to complete
      await installProcess.exit;
      console.log("✅ Dependencies installed");

      console.log("Starting development server...");
      const devProcess = await webContainer.spawn('npm', ['run', 'dev']);

      devProcess.output.pipeTo(new WritableStream({
        write(data) {
          console.log("🔧 Dev output:", data);
          const match = data.match(/(http:\/\/localhost:\d+)/);
          if (match) {
            const extractedUrl = match[1].replace("localhost", "3000");
            setUrl(`http://${window.location.hostname}:3000`);
            console.log("✅ Server ready at:", extractedUrl);
          }
        }
      }));

      // Optional: also listen for server-ready
      webContainer.on('server-ready', (port, readyUrl) => {
        console.log("🌐 server-ready event:", readyUrl);
        setUrl(readyUrl);
      });
    };

    startServer();
  }, [webContainer]);

  return (
    <div className="h-full flex items-center justify-center bg-gray-50">
  {!url ? (
    <div className="flex flex-col items-center gap-4">
      
      {/* Spinner */}
      <div className="w-12 h-12 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>

      {/* Animated text */}
      <p className="text-gray-700 text-lg font-medium animate-pulse">
        Starting Dev Server...
      </p>

      {/* Subtext */}
      <p className="text-gray-500 text-sm">
        This may take a few seconds
      </p>

    </div>
  ) : (
    <iframe
      className="w-full h-full border-0"
      src={url}
      title="preview"
    />
  )}
</div>
  );
}
