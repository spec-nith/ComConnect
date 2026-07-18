import React from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import Homepage from "./Pages/Homepage";
import Chatpage from "./Pages/Chatpage";
import { ChakraProvider } from "@chakra-ui/react";
import ChatProvider from "./Context/ChatProvider";
import { SocketProvider } from "./Context/SocketContext";
import WorkspaceSelection from "./components/workspace/WorkspaceSelection";
import MyWorkspaces from "./components/workspace/MyWorkspaces";
import WorkspaceProvider from "./Context/WorkspaceProvider";
import TaskAllocatorPage from "./components/task_allocator/TaskAllocatorPage";
import MyTasks from "./components/task_allocator/MyTasks";
import Signup from "./components/Authentication/Signup";
import Geo from "./components/geolocation/App";
import theme from "./theme";
import PWAInstallPrompt from "./components/pwa/PWAInstallPrompt";
import AnalyticsDashboard from "./Pages/AnalyticsDashboard";

const App = () => {
  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ChakraProvider theme={theme}>
        <ChatProvider>
          <SocketProvider>
            <WorkspaceProvider>
              <main className="app-root">
                <Routes>
                  <Route path="/" element={<Homepage />} />
                  <Route path="/signup" element={<Signup />} />
                  <Route path="/geo-location" element={<Geo />} />
                  <Route path="/workspace/:workspaceId/map" element={<Geo />} />
                  <Route path="/analytics" element={<AnalyticsDashboard />} />
                  <Route path="/tasks/:workspaceId" element={<TaskAllocatorPage />} /> {/* Updated route */}
                  <Route path="/my-tasks" element={<MyTasks />} />
                  <Route path="/chats" element={<Chatpage />} />
                  <Route path="/workspace" element={<WorkspaceSelection />} />
                  <Route path="/my-workspaces" element={<MyWorkspaces />} />
                  <Route path="/workspace/:workspaceId/chats" element={<Chatpage />} />
                </Routes>
                <PWAInstallPrompt />
              </main>
            </WorkspaceProvider>
          </SocketProvider>
        </ChatProvider>
      </ChakraProvider>
    </Router>
  );
};

export default App;
