import { useEffect, useState } from "react";
import { WebContainer } from "@webcontainer/api";

let webcontainerInstance: WebContainer | null = null;
let isBooting = false;

export function useWebContainer() {
  const [webcontainer, setWebcontainer] = useState<WebContainer | null>(null);

  useEffect(() => {
    async function bootContainer() {
      if (webcontainerInstance) {
        setWebcontainer(webcontainerInstance);
        return;
      }

      if (isBooting) return;
      isBooting = true;

      webcontainerInstance = await WebContainer.boot();
      isBooting = false;
      setWebcontainer(webcontainerInstance);
    }

    bootContainer();
  }, []);

  return webcontainer;
}