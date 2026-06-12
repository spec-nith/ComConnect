import {
  Box,
  Button,
  Flex,
  HStack,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  useToast,
} from "@chakra-ui/react";
import axios from "axios";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FiArrowLeft, FiRefreshCw } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { ChatState } from "../../Context/ChatProvider";
import { API_URL } from "../../config/api.config";
import TaskCard from "./TaskCard";
import BrandMark from "../brand/BrandMark";

const MyTasks = () => {
  const { user } = ChatState();
  const navigate = useNavigate();
  const toast = useToast();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const config = useMemo(
    () => ({ headers: { Authorization: `Bearer ${user?.token}` } }),
    [user?.token]
  );

  const fetchMyTasks = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/tasks/my-tasks`, config);
      setTasks(data);
    } catch (error) {
      toast({
        title: "Tasks could not be loaded",
        description: error.response?.data?.message || error.message,
        status: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [config, toast, user?.token]);

  useEffect(() => {
    fetchMyTasks();
  }, [fetchMyTasks]);

  return (
    <Box minH="100dvh" bg="#101414" color="#eef4f1">
      <Flex
        minH="68px"
        px={{ base: 4, md: 7 }}
        align="center"
        justify="space-between"
        borderBottom="1px solid #313b37"
        bg="#141918"
      >
        <HStack spacing={3}>
          <BrandMark size="38px" />
          <Box>
            <Text fontWeight="750">All my tasks</Text>
            <Text color="#8f9d97" fontSize="xs">Assigned work across ComConnect</Text>
          </Box>
        </HStack>
        <HStack>
          <Button size="sm" variant="ghost" leftIcon={<FiRefreshCw />} onClick={fetchMyTasks}>
            Refresh
          </Button>
          <Button size="sm" bg="#2c3532" leftIcon={<FiArrowLeft />} onClick={() => navigate("/workspace")}>
            Workspaces
          </Button>
        </HStack>
      </Flex>
      <Box px={{ base: 4, md: 7 }} py={7}>
        <Text fontSize="2xl" fontWeight="750">Assigned to me</Text>
        <Text color="#8f9d97" fontSize="sm" mt={1} mb={6}>{tasks.length} tasks across your workspaces</Text>
        {loading ? (
          <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={4}>
            <Skeleton h="160px" startColor="#202725" endColor="#2c3532" />
            <Skeleton h="160px" startColor="#202725" endColor="#2c3532" />
          </SimpleGrid>
        ) : tasks.length === 0 ? (
          <Flex minH="220px" align="center" justify="center" border="1px dashed #3a4541">
            <Stack align="center" spacing={2}>
              <Text fontWeight="600">Nothing assigned yet</Text>
              <Text color="#6f7d77" fontSize="sm">New tasks will appear here.</Text>
            </Stack>
          </Flex>
        ) : (
          <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={4}>
            {tasks.map((task) => (
              <TaskCard key={task._id} task={task} fetchTasks={fetchMyTasks} config={config} />
            ))}
          </SimpleGrid>
        )}
      </Box>
    </Box>
  );
};

export default MyTasks;
