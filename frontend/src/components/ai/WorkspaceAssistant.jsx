import React, { useState } from "react";
import axios from "axios";
import {
  Badge,
  Box,
  Button,
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
import { FiCpu } from "react-icons/fi";

import { API_URL } from "../../config/api.config";
import { ChatState } from "../../Context/ChatProvider";

const WorkspaceAssistant = ({ workspaceId, onTasksCreated }) => {
  const { user } = ChatState();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();
  const [question, setQuestion] = useState("");
  const [planningRequest, setPlanningRequest] = useState("");
  const [coordinatorQuestion, setCoordinatorQuestion] = useState(
    "Are we ready for the event? What is blocked?"
  );
  const [answer, setAnswer] = useState(null);
  const [plan, setPlan] = useState(null);
  const [coordinatorReport, setCoordinatorReport] = useState(null);
  const [approvalToken, setApprovalToken] = useState(null);
  const [loading, setLoading] = useState(false);

  const config = {
    headers: { Authorization: `Bearer ${user?.token}` },
    timeout: 130000,
  };

  const runRequest = async (request, success) => {
    setLoading(true);
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
      const { data } = await axios.post(
        `${API_URL}/ai/workspaces/${workspaceId}/task-plan`,
        { request: planningRequest },
        config
      );
      setPlan(data.plan);
      setApprovalToken(data.approvalToken);
    });

  const applyPlan = () =>
    runRequest(
      async () => {
        await axios.post(
          `${API_URL}/ai/workspaces/${workspaceId}/task-plan/apply`,
          { approvalToken },
          config
        );
      },
      () => {
        toast({
          title: "Task plan applied",
          status: "success",
          duration: 3000,
          isClosable: true,
        });
        setPlan(null);
        setApprovalToken(null);
        onTasksCreated?.();
      }
    );

  const askCoordinator = () =>
    runRequest(async () => {
      const { data } = await axios.post(
        `${API_URL}/ai/workspaces/${workspaceId}/event-coordinator`,
        { question: coordinatorQuestion },
        config
      );
      setCoordinatorReport(data.report);
    });

  const renderReportList = (title, items) => (
    <Box>
      <Text fontSize="sm" color="gray.400" mb={2}>
        {title}
      </Text>
      {items?.length ? (
        <List spacing={2}>
          {items.map((item, index) => (
            <ListItem
              key={`${title}-${index}`}
              p={2}
              border="1px solid #313b37"
              bg="#202725"
              borderRadius="6px"
              fontSize="sm"
            >
              {item}
            </ListItem>
          ))}
        </List>
      ) : (
        <Text fontSize="sm" color="gray.500">
          None found
        </Text>
      )}
    </Box>
  );

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

      <Modal isOpen={isOpen} onClose={onClose} size="xl" isCentered>
        <ModalOverlay bg="blackAlpha.800" backdropFilter="blur(4px)" />
        <ModalContent bg="#171c1b" color="#eef4f1" border="1px solid #3a4541">
          <ModalHeader borderBottom="1px solid #313b37">
            <Text fontSize="lg">Workspace agents</Text>
            <Text color="#8f9d97" fontSize="xs" fontWeight="400" mt={1}>
              Search knowledge, plan work, and assess event readiness
            </Text>
          </ModalHeader>
          <ModalCloseButton _hover={{ bg: "#2c3532" }} />
          <ModalBody>
            <Tabs colorScheme="green" isFitted>
              <TabList>
                <Tab>Ask Workspace</Tab>
                <Tab>Plan Tasks</Tab>
                <Tab>Event Coordinator</Tab>
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
                        {answer.sources.map((source, index) => (
                          <Badge key={`${source.sourceId}-${index}`} mr={2} mb={2}>
                            {source.type}: {source.label}
                          </Badge>
                        ))}
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
                      isLoading={loading}
                      isDisabled={!planningRequest.trim()}
                      bg="#34d399"
                      color="#07120e"
                      _hover={{ bg: "#6ee7b7" }}
                    >
                      Generate Plan
                    </Button>
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
                  <VStack align="stretch" spacing={4}>
                    <Textarea
                      value={coordinatorQuestion}
                      onChange={(event) =>
                        setCoordinatorQuestion(event.target.value)
                      }
                      placeholder="Are we ready for the event?"
                      bg="#202725"
                      borderColor="#3a4541"
                    />
                    <Button
                      onClick={askCoordinator}
                      isLoading={loading}
                      isDisabled={!coordinatorQuestion.trim()}
                      bg="#34d399"
                      color="#07120e"
                      _hover={{ bg: "#6ee7b7" }}
                    >
                      Analyze Event
                    </Button>
                    {coordinatorReport && (
                      <Box display="flex" flexDirection="column" gap={4}>
                        <Badge alignSelf="flex-start">
                          {coordinatorReport.readiness}
                        </Badge>
                        <Text whiteSpace="pre-wrap">
                          {coordinatorReport.answer}
                        </Text>
                        {renderReportList(
                          "Blocked items",
                          coordinatorReport.blocked_items
                        )}
                        {renderReportList(
                          "Overloaded members",
                          coordinatorReport.overloaded_members
                        )}
                        {renderReportList(
                          "Follow-up tasks",
                          coordinatorReport.follow_up_tasks
                        )}
                        {renderReportList("Risks", coordinatorReport.risks)}
                      </Box>
                    )}
                  </VStack>
                </TabPanel>
              </TabPanels>
            </Tabs>
          </ModalBody>
          <ModalFooter>
            {plan && (
              <Button
                bg="#34d399"
                color="#07120e"
                _hover={{ bg: "#6ee7b7" }}
                mr={3}
                onClick={applyPlan}
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
