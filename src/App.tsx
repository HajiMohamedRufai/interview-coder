import { ToastProvider } from "./components/ui/toast"
import Queue from "./_pages/Queue"
import { ToastViewport } from "@radix-ui/react-toast"
import { useEffect, useRef, useState } from "react"
import Solutions from "./_pages/Solutions"
import { QueryClient, QueryClientProvider } from "react-query"
import axios from "axios"

declare global {
  interface Window {
    electronAPI: {
      toggleMainWindow: () => Promise<void>
      takeScreenshot: () => Promise<{ path: string; preview: string }>
      getScreenshots: () => Promise<Array<{ path: string; preview: string }>>

      deleteScreenshot: (
        path: string
      ) => Promise<{ success: boolean; error?: string }>
      onScreenshotTaken: (
        callback: (data: { path: string; preview: string }) => void
      ) => () => void
      onProcessingStart: (callback: () => void) => () => void
      onProcessingSuccess: (callback: (data: any) => void) => () => void
      onProcessingExtraSuccess: (callback: (data: any) => void) => () => void
      onProcessingError: (callback: (error: string) => void) => () => void
      onProcessingNoScreenshots: (callback: () => void) => () => void
      updateContentHeight: (height: number) => Promise<void>
    }
  }
}

const queryClient = new QueryClient()

const App: React.FC = () => {
  const [view, setView] = useState<"queue" | "solutions">("queue")
  const containerRef = useRef<HTMLDivElement>(null)

  // Effect for height monitoring
  useEffect(() => {
    if (!containerRef.current) return

    const updateHeight = () => {
      if (!containerRef.current) return
      const height = containerRef.current.scrollHeight
      window.electronAPI?.updateContentHeight(height)
    }

    const resizeObserver = new ResizeObserver(() => {
      updateHeight()
    })

    // Initial height update
    updateHeight()

    // Observe for changes
    resizeObserver.observe(containerRef.current)

    // Also update height when view changes
    const mutationObserver = new MutationObserver(() => {
      updateHeight()
    })

    mutationObserver.observe(containerRef.current, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    })

    return () => {
      resizeObserver.disconnect()
      mutationObserver.disconnect()
    }
  }, [view]) // Re-run when view changes
  useEffect(() => {
    const cleanupFunctions = [
      window.electronAPI.onProcessingStart(() => {
        setView("solutions")
        console.log("starting processing")
      }),
      window.electronAPI.onProcessingSuccess(async (data) => {
        if (view == "queue") {
          console.log("the view is queue")
          queryClient.setQueryData(["problem_statement"], data)
          queryClient.invalidateQueries(["problem_statement"])
          try {
            // Step 2: Generate solutions
            console.log("Trying to generate solutions")
            const solutionsResponse = await axios.post(
              "http://0.0.0.0:8000/generate_solutions",
              { problem_info: data },
              {
                timeout: 300000
              }
            )
            // Extract solution code and thoughts from the new schema
            console.log({ solutionsResponse })
            const solutionCode = solutionsResponse.data.solution.code
            const thoughtProcess = solutionsResponse.data.solution.thoughts

            // Store both code and thoughts in React Query
            queryClient.setQueryData(["solution"], solutionCode)
            queryClient.setQueryData(["thoughts"], thoughtProcess)
          } catch (error) {
            console.log("error generating solutions")
          }
        }
      }),
      window.electronAPI.onProcessingExtraSuccess((data) => {
        console.log("solutions data", { data })
        queryClient.invalidateQueries(["solution"])
        queryClient.invalidateQueries(["thoughts"])
        const solutionCode = data.solution.code
        const thoughtProcess = data.solution.thoughts
        queryClient.setQueryData(["solution"], solutionCode)
        queryClient.setQueryData(["thoughts"], thoughtProcess)
      })
    ]
    return () => cleanupFunctions.forEach((cleanup) => cleanup())
  }, [])

  return (
    <div
      ref={containerRef}
      className="min-h-0 overflow-hidden "
      style={{ width: "600px" }} // Match your electron window width
    >
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <div className="p-4">
            {view === "queue" ? <Queue setView={setView} /> : <Solutions />}
          </div>
          <ToastViewport />
        </ToastProvider>
      </QueryClientProvider>
    </div>
  )
}

export default App
