import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  Badge,
  Box,
  Button,
  HStack,
  Divider,
  List,
  ListItem,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  Textarea,
  useDisclosure,
  useToast,
  VStack,
} from "@chakra-ui/react";
import { FiCheckCircle, FiCpu, FiLoader, FiSearch, FiUsers } from "react-icons/fi";
import { useNavigate } from "react-router-dom";

import { API_URL } from "../../config/api.config";
import { ChatState } from "../../Context/ChatProvider";
import VoiceAgentPanel from "./VoiceAgentPanel";

const WorkspaceAssistant = ({ workspaceId, onTasksCreated }) => {
  const { user, chats, setSelectedChat, setHighlightedMessageId } = ChatState();
  const navigate = useNavigate();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();
  const [question, setQuestion] = useState("");
  const [planningRequest, setPlanningRequest] = useState("");
  const [answer, setAnswer] = useState(null);
  const [plan, setPlan] = useState(null);
  const [approvalToken, setApprovalToken] = useState(null);
  const [agentTrace, setAgentTrace] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState(null);
  const [planningStep, setPlanningStep] = useState(0);

  const planningSteps = [
    { label: "Reading workspace context", icon: FiSearch },
    { label: "Searching messages and tasks", icon: FiSearch },
    { label: "Inspecting existing work", icon: FiCheckCircle },
    { label: "Checking member workload", icon: FiUsers },
    { label: "Drafting approval tasks", icon: FiLoader },
  ];

  const config = {
    headers: { Authorization: `Bearer ${user?.token}` },
    timeout: 130000,
  };

  useEffect(() => {
    if (!loading || activeAction !== "plan") {
      setPlanningStep(0);
      return undefined;
    }
    const interval = setInterval(() => {
      setPlanningStep((current) =>
        Math.min(current + 1, planningSteps.length - 1)
      );
    }, 1800);
    return () => clearInterval(interval);
  }, [activeAction, loading, planningSteps.length]);

  const runRequest = async (request, success, action = null) => {
    setLoading(true);
    setActiveAction(action);
    try {
      await request();
      if (success) success();
    } catch (error) {
      toast({
        title: "AI assistant unavailable",
        description: error.response?.data?.message || error.message,
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
      setActiveAction(null);
    }
  };

  const ask = () =>
    runRequest(async () => {
      const { data } = await axios.post(
        `${API_URL}/ai/workspaces/${workspaceId}/ask`,
        { question },
        config
      );
      setAnswer(data);
    });

  const createPlan = () =>
    runRequest(async () => {
      setPlan(null);
      setApprovalToken(null);
      setAgentTrace(null);
      const { data } = await axios.post(
        `${API_URL}/ai/workspaces/${workspaceId}/task-plan`,
        { request: planningRequest },
        config
      );
      setPlan(data.plan);
      setApprovalToken(data.approvalToken);
      setAgentTrace(data.agent);
    }, null, "plan");

  const applyPlan = (token = approvalToken, source = "Task plan") =>
    runRequest(
      async () => {
        await axios.post(
          `${API_URL}/ai/workspaces/${workspaceId}/task-plan/apply`,
          { approvalToken: token },
          config
        );
      },
      () => {
        toast({
          title: `${source} applied`,
          status: "success",
          duration: 3000,
          isClosable: true,
        });
        setPlan(null);
        setApprovalToken(null);
        onTasksCreated?.();
      }
    );

  const openSource = (source) => {
    if (source.type === "task") {
      onClose();
      navigate(`/tasks/${workspaceId}`);
      return;
    }

    if (source.type === "message" && source.chatId) {
      const chat = chats?.find((item) => item._id === source.chatId);
      if (!chat) {
        toast({
          title: "Source chat is not loaded",
          description: "Refresh the workspace chats and try opening the source again.",
          status: "warning",
        });
        return;
      }
      setSelectedChat(chat);
      setHighlightedMessageId?.(source.sourceId);
      onClose();
      navigate(`/workspace/${workspaceId}/chats`);
    }
  };

  const sourceTitle = (source) =>
    source.type === "message"
      ? `Source [${source.index}] message in ${source.label || "workspace chat"}`
      : `Source [${source.index}] ${source.type || "workspace"}: ${
          source.label || "Workspace"
        }`;

  return (
    <>
      <Button
        leftIcon={<FiCpu />}
        onClick={onOpen}
        px={4}
        py={2}
        height="32px"
        fontWeight="600"
        borderRadius="6px"
        flexShrink={0}
        fontSize="sm"
        bg="#202725"
        color="#dce6e1"
        border="1px solid #3a4541"
        _hover={{ bg: "#2c3532" }}
      >
        Agents
      </Button>

      <Modal isOpen={isOpen} onClose={onClose} size="2xl" isCentered>
        <ModalOverlay bg="blackAlpha.800" backdropFilter="blur(4px)" />
        <ModalContent bg="#171c1b" color="#eef4f1" border="1px solid #3a4541">
          <ModalHeader borderBottom="1px solid #313b37">
            <Text fontSize="lg">Workspace agents</Text>
            <Text color="#8f9d97" fontSize="xs" fontWeight="400" mt={1}>
              Search workspace knowledge and plan work
            </Text>
          </ModalHeader>
          <ModalCloseButton _hover={{ bg: "#2c3532" }} />
          <ModalBody>
            <Tabs colorScheme="green" isFitted>
              <TabList>
                <Tab>Ask Workspace</Tab>
                <Tab>Plan Tasks</Tab>
                <Tab>Voice Agent</Tab>
              </TabList>
              <TabPanels>
                <TabPanel px={0}>
                  <VStack align="stretch" spacing={4}>
                    <Textarea
                      value={question}
                      onChange={(event) => setQuestion(event.target.value)}
                      placeholder="What decisions were made about the event budget?"
                      bg="#202725"
                      borderColor="#3a4541"
                    />
                    <Button
                      onClick={ask}
                      isLoading={loading}
                      isDisabled={!question.trim()}
                      bg="#34d399"
                      color="#07120e"
                      _hover={{ bg: "#6ee7b7" }}
                    >
                      Ask
                    </Button>
                    {answer && (
                      <Box>
                        <Text whiteSpace="pre-wrap">{answer.answer}</Text>
                        <Divider my={4} borderColor="#313b37" />
                        <Text fontSize="sm" color="#8f9d97" mb={2}>
                          Sources
                        </Text>
                        <List spacing={2}>
                          {answer.sources.map((source, index) => (
                            <ListItem
                              key={`${source.sourceId}-${index}`}
                              as="button"
                              type="button"
                              textAlign="left"
                              width="100%"
                              p={3}
                              border="1px solid #313b37"
                              bg="#202725"
                              borderRadius="6px"
                              onClick={() => openSource(source)}
                              _hover={{ borderColor: "#52615b", bg: "#242c29" }}
                            >
                              <Badge bg="#2c3532" color="#6ee7b7" mb={2}>
                                [{source.index}] {source.type}
                              </Badge>
                              <Text fontSize="sm" fontWeight="700">
                                {sourceTitle(source)}
                              </Text>
                              {source.createdAt && (
                                <Text fontSize="xs" color="#8f9d97" mt={1}>
                                  {new Date(source.createdAt).toLocaleString()}
                                </Text>
                              )}
                              <Text fontSize="xs" color="#bdc8c3" mt={2} noOfLines={3}>
                                {source.excerpt}
                              </Text>
                            </ListItem>
                          ))}
                        </List>
                      </Box>
                    )}
                  </VStack>
                </TabPanel>
                <TabPanel px={0}>
                  <VStack align="stretch" spacing={4}>
                    <Textarea
                      value={planningRequest}
                      onChange={(event) => setPlanningRequest(event.target.value)}
                      placeholder="Create a practical launch plan for the registration desk."
                      bg="#202725"
                      borderColor="#3a4541"
                    />
                    <Button
                      onClick={createPlan}
                      isLoading={loading && activeAction === "plan"}
                      loadingText="Planning"
                      isDisabled={!planningRequest.trim()}
                      bg="#34d399"
                      color="#07120e"
                      _hover={{ bg: "#6ee7b7" }}
                    >
                      Generate Plan
                    </Button>
                    {loading && activeAction === "plan" && (
                      <Box
                        border="1px solid #313b37"
                        bg="#202725"
                        borderRadius="6px"
                        p={3}
                      >
                        <Text fontSize="sm" fontWeight="700" color="#eef4f1" mb={3}>
                          Planning task allocation
                        </Text>
                        <VStack align="stretch" spacing={2}>
                          {planningSteps.map((step, index) => {
                            const complete = index < planningStep;
                            const active = index === planningStep;
                            const IconComponent = step.icon;
                            return (
                              <HStack
                                key={step.label}
                                spacing={2}
                                color={complete || active ? "#d7dfdb" : "#6f7d77"}
                              >
                                <Box
                                  as={IconComponent}
                                  size={14}
                                  color={complete ? "#34d399" : active ? "#6ee7b7" : "#52615b"}
                                />
                                <Text fontSize="xs">{step.label}</Text>
                                {active && (
                                  <Badge ml="auto" bg="#26332f" color="#6ee7b7">
                                    running
                                  </Badge>
                                )}
                              </HStack>
                            );
                          })}
                        </VStack>
                      </Box>
                    )}
                    {plan && (
                      <Box>
                        <Text mb={3}>{plan.summary}</Text>
                        <List spacing={3}>
                          {plan.tasks.map((task, index) => (
                            <ListItem
                              key={`${task.heading}-${index}`}
                              p={3}
                              border="1px solid #313b37"
                              bg="#202725"
                              borderRadius="6px"
                            >
                              <Text fontWeight="semibold">{task.heading}</Text>
                              <Text fontSize="sm" color="gray.300">
                                {task.description}
                              </Text>
                              <Text fontSize="xs" color="gray.400" mt={2}>
                                {task.assigneeEmail} - {task.priority}
                              </Text>
                            </ListItem>
                          ))}
                        </List>
                      </Box>
                    )}
                  </VStack>
                </TabPanel>
                <TabPanel px={0}>
                  <VoiceAgentPanel
                    workspaceId={workspaceId}
                    onTasksCreated={onTasksCreated}
                  />
                </TabPanel>
              </TabPanels>
            </Tabs>
          </ModalBody>
          <ModalFooter>
            {agentTrace?.tool_call_count > 0 && (
              <Text fontSize="xs" color="#8f9d97" mr="auto">
                Agent used {agentTrace.tool_call_count} tools:{" "}
                {[...new Set(agentTrace.tools_called)].join(", ")}
              </Text>
            )}
            {plan && (
              <Button
                bg="#34d399"
                color="#07120e"
                _hover={{ bg: "#6ee7b7" }}
                mr={3}
                onClick={() => applyPlan()}
                isLoading={loading}
              >
                Approve and Create Tasks
              </Button>
            )}
            <Button variant="ghost" color="#bdc8c3" onClick={onClose} _hover={{ bg: "#202725" }}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default WorkspaceAssistant;
