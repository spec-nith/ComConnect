import React from "react";
import { useParams } from "react-router-dom";
import TaskAllocator from "./TaskAllocator";

const TaskAllocatorPage = () => {
  const { workspaceId } = useParams();
  return <TaskAllocator workspaceId={workspaceId} />;
};

export default TaskAllocatorPage;
