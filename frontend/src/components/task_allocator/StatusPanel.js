import { Box, Flex, Skeleton, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import TaskCard from "./TaskCard";

const StatusPanel = ({
  title,
  accent,
  status,
  tasks,
  loading,
  fetchTasks,
  config,
  onMove,
  currentUserId,
}) => {
  const [draggingOver, setDraggingOver] = useState(false);

  return (
  <Box
    minW={0}
    bg={draggingOver ? "#19231f" : "#141918"}
    border="1px solid"
    borderColor={draggingOver ? accent : "#313b37"}
    transition="background 120ms ease, border-color 120ms ease"
    onDragOver={(event) => {
      event.preventDefault();
      setDraggingOver(true);
    }}
    onDragLeave={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setDraggingOver(false);
    }}
    onDrop={(event) => {
      event.preventDefault();
      setDraggingOver(false);
      onMove?.(event.dataTransfer.getData("text/task-id"), status);
    }}
  >
    <Flex px={4} py={3} align="center" justify="space-between" borderBottom="1px solid #313b37">
      <Flex align="center" gap={2}>
        <Box w="7px" h="7px" borderRadius="50%" bg={accent} />
        <Text fontSize="sm" fontWeight="700">{title}</Text>
      </Flex>
      <Flex
        minW="24px"
        h="24px"
        px={2}
        align="center"
        justify="center"
        bg="#202725"
        color="#9eaaa5"
        fontSize="xs"
        borderRadius="4px"
      >
        {tasks.length}
      </Flex>
    </Flex>
    <Stack spacing={3} p={3} minH={{ base: "120px", lg: "260px" }}>
      {loading ? (
        <>
          <Skeleton h="150px" startColor="#202725" endColor="#2c3532" />
          <Skeleton h="120px" startColor="#202725" endColor="#2c3532" />
        </>
      ) : tasks.length === 0 ? (
        <Flex minH="96px" align="center" justify="center" px={4}>
          <Text color="#6f7d77" fontSize="sm" textAlign="center">
            No tasks in this stage
          </Text>
        </Flex>
      ) : (
        tasks.map((task) => (
          <TaskCard
            key={task._id}
            task={task}
            fetchTasks={fetchTasks}
            config={config}
            draggable={
              task.assignee?._id === currentUserId ||
              task.createdBy?._id === currentUserId
            }
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/task-id", task._id);
            }}
          />
        ))
      )}
    </Stack>
  </Box>
  );
};

export default StatusPanel;
