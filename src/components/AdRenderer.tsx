import React, { useEffect, useRef } from 'react';

interface AdRendererProps {
  htmlCode?: string;
  className?: string;
}

export default function AdRenderer({ htmlCode, className = "" }: AdRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!htmlCode || !containerRef.current) return;

    // Clear old elements
    containerRef.current.innerHTML = '';

    // Create a temporary container
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlCode;

    // Process nodes and script tags
    const nodes = Array.from(tempDiv.childNodes);
    
    nodes.forEach((node) => {
      if (node.nodeName === 'SCRIPT') {
        const script = document.createElement('script');
        // Copy attributes
        Array.from((node as HTMLScriptElement).attributes).forEach(attr => {
          script.setAttribute(attr.name, attr.value);
        });
        // Copy inline script content
        script.text = (node as HTMLScriptElement).innerHTML;
        // Local error shield to prevent script load/execution errors from crashing the app
        script.onerror = (err) => {
          console.warn("Ad script loading or execution failed:", err);
        };
        containerRef.current.appendChild(script);
      } else {
        containerRef.current.appendChild(node.cloneNode(true));
      }
    });
  }, [htmlCode]);

  if (!htmlCode) return null;

  return (
    <div 
      ref={containerRef} 
      className={`ad-renderer-container w-full min-h-[50px] flex justify-center items-center overflow-hidden bg-neutral-900/5 hover:bg-neutral-900/10 transition-all duration-300 mx-auto rounded-xl p-2 ${className}`}
    />
  );
}
