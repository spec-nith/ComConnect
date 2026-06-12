import React, { useState, useEffect } from "react";
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
  Button,
  useDisclosure,
  VStack,
  useToast,
} from "@chakra-ui/react";
import axios from "axios";
import { ChatState } from "../../Context/ChatProvider";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../../config/api.config";

const JoinWorkspaceModal = ({ children }) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [workspaceId, setWorkspaceId] = useState("");
  const [roleName, setRoleName] = useState("");
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState([]);
  const toast = useToast();
  const { user, setChats } = ChatState();
  const navigate = useNavigate(); // Initialize useNavigate

  useEffect(() => {
    const fetchGroups = async () => {
      if (user?.token && workspaceId) {
        try {
          const config = {
            headers: {
              Authorization: `Bearer ${user.token}`,
            },
          };

          // Ensure you have a workspaceId to use in the API call
          if (!workspaceId) {
            console.error("Workspace ID is required to fetch groups.");
            return;
          }

          const url = `${API_URL}/workspace/${workspaceId}/groups`;
          const { data } = await axios.get(url, config);
          setGroups(data);
        } catch (error) {
          console.error("Failed to fetch groups:", error);
        }
      }
    };

    // Fetch groups when component mounts
    fetchGroups();
  }, [workspaceId, user?.token]);

  const findGroupIdByRoleName = (roleName) => {
    const group = groups.find((group) => group.chatName === roleName);
    return group ? group._id : null;
  };

  const joinWorkspace = async () => {
    setLoading(true);
    try {
      const config = {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      };

      const groupId = findGroupIdByRoleName(roleName);
      if (!groupId) {
        throw new Error("Group ID not found for the given role name.");
      }

      const { data } = await axios.post(
        `${API_URL}/workspace/join`,
        { workspaceId, groupId },
        config
      );

      toast({
        title: "Successfully joined the workspace.",
        status: "success",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });

      setChats(data.group); // Update chats with the joined group
      onClose();

      navigate(`/workspace/${workspaceId}/chats`); // Redirect to the workspace chat
    } catch (error) {
      toast({
        title: "Error occurred!",
        description: error.message,
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
    }
    setLoading(false);
  };

  return (
    <>
      <span onClick={onOpen}>{children}</span>

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
          <ModalHeader color="white">Join Workspace</ModalHeader>
          <ModalCloseButton color="#eef4f1" _hover={{ bg: "#2c3532" }} />

          <ModalBody>
            <VStack spacing={4} align="stretch">
              <FormControl isRequired>
                <FormLabel color="gray.300">Workspace ID</FormLabel>
                <Input
                  placeholder="Enter Workspace ID"
                  value={workspaceId}
                  onChange={(e) => setWorkspaceId(e.target.value)}
                  bg="#202725"
                  borderColor="#3a4541"
                  color="white"
                  _placeholder={{ color: "gray.400" }}
                  _hover={{ borderColor: "#52615b" }}
                  _focus={{
                    borderColor: "#34d399",
                    boxShadow: "0 0 0 1px #34d399",
                    bg: "#202725",
                  }}
                />
              </FormControl>

              <FormControl isRequired>
                <FormLabel color="gray.300">Role Name</FormLabel>
                <Input
                  placeholder="Enter Role Name"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  bg="#202725"
                  borderColor="#3a4541"
                  color="white"
                  _placeholder={{ color: "gray.400" }}
                  _hover={{ borderColor: "#52615b" }}
                  _focus={{
                    borderColor: "#34d399",
                    boxShadow: "0 0 0 1px #34d399",
                    bg: "#202725",
                  }}
                />
              </FormControl>

              <Button
                bg="#34d399"
                color="#07120e"
                _hover={{ bg: "#6ee7b7" }}
                _active={{ bg: "#10b981" }}
                onClick={joinWorkspace}
                isLoading={loading}
                mt={4}
              >
                Join Workspace
              </Button>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
};

export default JoinWorkspaceModal;
