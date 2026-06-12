import {
  Avatar,
  Badge,
  Box,
  Button,
  Divider,
  Flex,
  FormControl,
  HStack,
  Link,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Stack,
  Text,
  Textarea,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import axios from "axios";
import { useEffect, useState } from "react";
import { FiExternalLink, FiMessageSquare } from "react-icons/fi";
import { API_URL } from "../../config/api.config";

const statusLabels = {
  "to-do": "To do",
  "in-progress": "In progress",
  done: "Done",
};

const TaskCard = ({ task, fetchTasks, config, draggable = false, onDragStart }) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();
  const [newStatus, setNewStatus] = useState(task.status);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const assignee = task.assignee || {};
  const creator = task.createdBy || {};

  useEffect(() => setNewStatus(task.status), [task.status]);

  const updateTaskStatus = async () => {
    if (newStatus === task.status) return;
    setSaving(true);
    try {
      await axios.patch(
        `${API_URL}/tasks/update-status`,
        { taskId: task._id, status: newStatus },
        config
      );
      await fetchTasks();
      toast({ title: "Task status updated", status: "success" });
    } catch (error) {
      toast({
        title: "Status could not be updated",
        description: error.response?.data?.message || error.message,
        status: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    setSaving(true);
    try {
      await axios.post(
        `${API_URL}/tasks/add-comment`,
        { taskId: task._id, comment: comment.trim() },
        config
      );
      setComment("");
      await fetchTasks();
      toast({ title: "Comment added", status: "success" });
    } catch (error) {
      toast({
        title: "Comment could not be added",
        description: error.response?.data?.message || error.message,
        status: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Box
        draggable={draggable}
        onDragStart={onDragStart}
        p={4}
        bg="#202725"
        border="1px solid #313b37"
        cursor={draggable ? "grab" : "pointer"}
        transition="border-color 160ms ease, transform 160ms ease"
        _hover={{ borderColor: "#52615b", transform: "translateY(-1px)" }}
        onClick={onOpen}
      >
        <Flex justify="space-between" gap={3} align="start">
          <Text fontWeight="700" fontSize="sm" lineHeight="1.35" noOfLines={2}>
            {task.heading}
          </Text>
          {task.priority && (
            <Badge
              bg={task.priority === "high" ? "#4b2727" : "#2c3532"}
              color={task.priority === "high" ? "#fca5a5" : "#9eaaa5"}
              fontSize="9px"
              borderRadius="3px"
            >
              {task.priority}
            </Badge>
          )}
        </Flex>
        <Text color="#9eaaa5" fontSize="xs" lineHeight="1.5" mt={2} noOfLines={3}>
          {task.description}
        </Text>
        {task.tags?.length > 0 && (
          <Flex mt={3} gap={1} wrap="wrap">
            {task.tags.slice(0, 4).map((tag) => (
              <Text key={tag} color="#6ee7b7" fontSize="10px">
                #{tag}
              </Text>
            ))}
          </Flex>
        )}
        <Flex mt={4} align="center" justify="space-between" gap={2}>
          <HStack spacing={2} minW={0}>
            <Avatar
              size="xs"
              name={assignee.name || assignee.email || "Member"}
              bg="#32604f"
              color="#effcf6"
            />
            <Text color="#bdc8c3" fontSize="xs" noOfLines={1}>
              {assignee.name || assignee.email || "Workspace member"}
            </Text>
          </HStack>
          <HStack color="#6f7d77" spacing={1}>
            <FiMessageSquare size={12} />
            <Text fontSize="xs">{task.comments?.length || 0}</Text>
          </HStack>
        </Flex>
      </Box>

      <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered>
        <ModalOverlay bg="blackAlpha.800" backdropFilter="blur(4px)" />
        <ModalContent bg="#171c1b" color="#eef4f1" border="1px solid #3a4541">
          <ModalHeader pr={12}>
            <Text fontSize="lg">{task.heading}</Text>
            <Badge mt={2} bg="#2c3532" color="#bdc8c3" borderRadius="3px">
              {statusLabels[task.status] || task.status}
            </Badge>
          </ModalHeader>
          <ModalCloseButton _hover={{ bg: "#2c3532" }} />
          <ModalBody>
            <Stack spacing={5}>
              <Box>
                <Text color="#6f7d77" fontSize="xs" textTransform="uppercase">Description</Text>
                <Text mt={2} color="#d7dfdb" lineHeight="1.65">{task.description}</Text>
              </Box>
              <Flex gap={6} wrap="wrap">
                <Box>
                  <Text color="#6f7d77" fontSize="xs">Assigned to</Text>
                  <Text mt={1} fontSize="sm">{assignee.name || assignee.email || "Member"}</Text>
                </Box>
                <Box>
                  <Text color="#6f7d77" fontSize="xs">Created by</Text>
                  <Text mt={1} fontSize="sm">{creator.name || creator.email || "Member"}</Text>
                </Box>
              </Flex>
              {task.attachments?.length > 0 && (
                <Box>
                  <Text color="#6f7d77" fontSize="xs" mb={2}>Attachments</Text>
                  <Stack spacing={1}>
                    {task.attachments.map((attachment) => (
                      <Link
                        key={attachment}
                        href={attachment}
                        isExternal
                        color="#6ee7b7"
                        fontSize="sm"
                        noOfLines={1}
                      >
                        {attachment} <FiExternalLink style={{ display: "inline" }} />
                      </Link>
                    ))}
                  </Stack>
                </Box>
              )}
              <Divider borderColor="#313b37" />
              <FormControl>
                <Text color="#bdc8c3" fontSize="sm" fontWeight="600" mb={2}>Move task</Text>
                <HStack align="stretch">
                  <Select
                    value={newStatus}
                    onChange={(event) => setNewStatus(event.target.value)}
                    bg="#202725"
                    borderColor="#3a4541"
                    color="#eef4f1"
                    sx={{ option: { background: "#202725" } }}
                  >
                    <option value="to-do">To do</option>
                    <option value="in-progress">In progress</option>
                    <option value="done">Done</option>
                  </Select>
                  <Button
                    bg="#34d399"
                    color="#07120e"
                    onClick={updateTaskStatus}
                    isLoading={saving}
                    isDisabled={newStatus === task.status}
                    _hover={{ bg: "#6ee7b7" }}
                  >
                    Save
                  </Button>
                </HStack>
              </FormControl>
              <Box>
                <Text color="#bdc8c3" fontSize="sm" fontWeight="600" mb={2}>Add an update</Text>
                <Textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Share progress, a blocker, or a decision"
                  bg="#202725"
                  borderColor="#3a4541"
                  resize="vertical"
                />
                <Button
                  mt={2}
                  size="sm"
                  variant="outline"
                  borderColor="#52615b"
                  color="#d7dfdb"
                  onClick={addComment}
                  isLoading={saving}
                  isDisabled={!comment.trim()}
                  _hover={{ bg: "#202725" }}
                >
                  Add update
                </Button>
              </Box>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" color="#bdc8c3" onClick={onClose} _hover={{ bg: "#202725" }}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default TaskCard;
