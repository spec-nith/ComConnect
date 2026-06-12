import { Box, Flex, SimpleGrid, Skeleton, Text, useToast } from "@chakra-ui/react";
import axios from "axios";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatState } from "../../Context/ChatProvider";
import { API_URL } from "../../config/api.config";
import TaskCard from "./TaskCard";

const AllocatedTasks = ({ workspaceId }) => {
  const { user } = ChatState();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const config = useMemo(
    () => ({
      headers: { Authorization: `Bearer ${user?.token}` },
    }),
    [user?.token]
  );

  const fetchAllocatedTasks = useCallback(async () => {
    if (!user?.token || !workspaceId) return;
    setLoading(true);
    try {
      const { data } = await axios.get(
        `${API_URL}/tasks/allocated-tasks?workspaceId=${workspaceId}`,
        config
      );
      setTasks(data);
    } catch (error) {
      toast({
        title: "Allocated tasks could not be loaded",
        description: error.response?.data?.message || error.message,
        status: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [user?.token, workspaceId, config, toast]);

  useEffect(() => {
    fetchAllocatedTasks();
  }, [fetchAllocatedTasks]);

  return (
    <Box mt={9} pt={6} borderTop="1px solid #313b37">
      <Flex align="end" justify="space-between" mb={4}>
        <Box>
          <Text fontSize="lg" fontWeight="750">Tasks I allocated</Text>
          <Text color="#8f9d97" fontSize="sm">Work you assigned to other members</Text>
        </Box>
        <Text color="#6f7d77" fontSize="sm">{tasks.length} total</Text>
      </Flex>
      {loading ? (
        <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={3}>
          <Skeleton h="150px" startColor="#202725" endColor="#2c3532" />
          <Skeleton h="150px" startColor="#202725" endColor="#2c3532" />
        </SimpleGrid>
      ) : tasks.length === 0 ? (
        <Flex minH="100px" align="center" justify="center" border="1px dashed #3a4541">
          <Text color="#6f7d77" fontSize="sm">You have not allocated a task yet</Text>
        </Flex>
      ) : (
        <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={3}>
          {tasks.map((task) => (
            <TaskCard
              key={task._id}
              task={task}
              fetchTasks={fetchAllocatedTasks}
              config={config}
            />
          ))}
        </SimpleGrid>
      )}
    </Box>
  );
};

export default AllocatedTasks;
