import React, { useState, useEffect, useMemo } from "react";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  Button,
  useToast,
  Stack,
  Box,
  List,
  ListItem,
} from "@chakra-ui/react";
import axios from "axios";
import { ChatState } from "../../Context/ChatProvider";
import { debounce } from "lodash";

import { API_URL } from "../../config/api.config";

const TaskDialog = ({ isOpen, onClose, workspaceId, selectedChat }) => {
  const { user } = ChatState();
  const toast = useToast();
  const [heading, setHeading] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [tags, setTags] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [channelUsers, setChannelUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedChat) {
      // Get users from the current chat/channel
      setChannelUsers(selectedChat.users || []);
    }
  }, [selectedChat]);

  // Debounce email search
  const debouncedEmailSearch = useMemo(
    () => debounce((searchTerm) => {
      if (searchTerm.trim()) {
        const filteredUsers = channelUsers.filter((user) =>
          user.email.toLowerCase().includes(searchTerm.toLowerCase())
        );
        setSearchResults(filteredUsers);
      } else {
        setSearchResults([]);
      }
    }, 300),
    [channelUsers]
  );

  useEffect(
    () => () => debouncedEmailSearch.cancel(),
    [debouncedEmailSearch]
  );

  const handleEmailSearch = (searchTerm) => {
    setEmail(searchTerm);
    debouncedEmailSearch(searchTerm);
  };

  const handleSubmit = async () => {
    if (!heading.trim() || !description.trim() || !email.trim()) {
      toast({
        title: "Please fill all required fields",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setLoading(true);
    try {
      const config = {
        headers: {
          Authorization: `Bearer ${user?.token}`,
          "Content-Type": "application/json",
        },
        timeout: 5000, // Set timeout to 5 seconds
      };

      await axios.post(
        `${API_URL}/tasks/allocate`,
        {
          heading: heading.trim(),
          description: description.trim(),
          email: email.trim(),
          workspaceId,
          attachments,
          tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        },
        config
      );

      toast({
        title: "Task Allocated",
        description: "Task has been successfully allocated.",
        status: "success",
        duration: 3000,
        isClosable: true,
      });

      onClose();
      // Reset form
      setHeading("");
      setDescription("");
      setEmail("");
      setAttachments([]);
      setTags("");
      setSearchResults([]);
    } catch (error) {
      console.error("Task allocation error:", {
        error: error.message,
        response: error.response?.data,
      });

      toast({
        title: "Error allocating task",
        description: error.response?.data?.message || "Failed to allocate task",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal size="lg" isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay bg="blackAlpha.800" backdropFilter="blur(4px)" />
      <ModalContent
        pb={4}
        pt={1}
        bg="#171c1b"
        color="#eef4f1"
        border="1px solid"
        borderColor="#3a4541"
      >
        <ModalHeader color="#eef4f1">Allocate a task</ModalHeader>
        <ModalCloseButton color="#eef4f1" _hover={{ bg: "#2c3532" }} />
        <ModalBody>
          <Stack spacing={4}>
            <FormControl isRequired>
              <FormLabel color="#bdc8c3">Task name</FormLabel>
              <Input
                value={heading}
                onChange={(e) => setHeading(e.target.value)}
                disabled={loading}
                bg="#202725"
                borderColor="#3a4541"
                color="#eef4f1"
                _placeholder={{ color: "#6f7d77" }}
                _hover={{ borderColor: "#52615b" }}
                _focus={{
                  borderColor: "#34d399",
                  boxShadow: "0 0 0 1px #34d399",
                }}
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel color="#bdc8c3">Description</FormLabel>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading}
                bg="#202725"
                borderColor="#3a4541"
                color="#eef4f1"
                _placeholder={{ color: "#6f7d77" }}
                _hover={{ borderColor: "#52615b" }}
                _focus={{
                  borderColor: "#34d399",
                  boxShadow: "0 0 0 1px #34d399",
                }}
              />
            </FormControl>
            <FormControl isRequired position="relative">
              <FormLabel color="#bdc8c3">Assignee email</FormLabel>
              <Input
                value={email}
                onChange={(e) => handleEmailSearch(e.target.value)}
                placeholder="Type to search users in channel"
                disabled={loading}
                bg="#202725"
                borderColor="#3a4541"
                color="#eef4f1"
                _placeholder={{ color: "#6f7d77" }}
                _hover={{ borderColor: "#52615b" }}
                _focus={{
                  borderColor: "#34d399",
                  boxShadow: "0 0 0 1px #34d399",
                }}
              />
              {searchResults.length > 0 && (
                <Box
                  position="absolute"
                  top="100%"
                  left={0}
                  right={0}
                  bg="#202725"
                  boxShadow="lg"
                  borderRadius="md"
                  maxH="200px"
                  overflowY="auto"
                  zIndex={1000}
                  border="1px solid"
                  borderColor="#3a4541"
                >
                  <List spacing={2}>
                    {searchResults.map((user) => (
                      <ListItem
                        key={user._id}
                        p={2}
                        cursor="pointer"
                        color="#eef4f1"
                        _hover={{ bg: "#2c3532" }}
                        onClick={() => {
                          setEmail(user.email);
                          setSearchResults([]);
                        }}
                      >
                        {user.email}
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}
            </FormControl>
            <FormControl>
              <FormLabel color="#bdc8c3">Attachment links</FormLabel>
              <Input
                value={attachments}
                onChange={(e) => setAttachments(e.target.value.split(","))}
                placeholder="Enter attachment URLs separated by commas"
                bg="#202725"
                borderColor="#3a4541"
                color="#eef4f1"
                _placeholder={{ color: "#6f7d77" }}
                _hover={{ borderColor: "#52615b" }}
                _focus={{
                  borderColor: "#34d399",
                  boxShadow: "0 0 0 1px #34d399",
                }}
              />
            </FormControl>
            <FormControl>
              <FormLabel color="#bdc8c3">Tags</FormLabel>
              <Input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="venue, urgent, launch"
                bg="#202725"
                borderColor="#3a4541"
                color="#eef4f1"
              />
            </FormControl>
            <Button
              bg="#34d399"
              color="#07120e"
              _hover={{ bg: "#6ee7b7" }}
              _active={{ bg: "#10b981" }}
              onClick={handleSubmit}
              isLoading={loading}
              loadingText="Allocating..."
            >
              Allocate task
            </Button>
          </Stack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default TaskDialog;
