import React, { useCallback, useState, useEffect } from "react";
import axios from "axios";
import emailjs from "emailjs-com";
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
  Stack,
  Box,
  List,
  ListItem,
  Tag,
  TagLabel,
  TagCloseButton,
  HStack,
  Text,
  useToast,
} from "@chakra-ui/react";
import { useWorkspace } from "../../Context/WorkspaceProvider";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../../config/api.config";

const CreateWorkspaceModal = ({ onClose }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [workspaceName, setWorkspaceName] = useState("");
  const [roles, setRoles] = useState([]);
  const [roleInput, setRoleInput] = useState("");
  const [roleList, setRoleList] = useState([]);
  const [selectedRole, setSelectedRole] = useState(null);
  const [emails, setEmails] = useState("");
  const { user } = useWorkspace();
  const [workspaceId, setWorkspaceId] = useState(null);
  const navigate = useNavigate();
  const toast = useToast();

  const token =
    user?.token || JSON.parse(localStorage.getItem("userInfo"))?.token;

  const createWorkspace = async () => {
    if (!workspaceName.trim()) {
      toast({
        title: "Workspace name is required",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    if (roles.length === 0) {
      toast({
        title: "Please add at least one role",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    try {
      const response = await axios.post(
        `${API_URL}/workspace`,
        { name: workspaceName, roles },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log("Workspace created:", response.data);
      setWorkspaceId(response.data.workspace._id);
      toast({
        title: "Workspace Created",
        description: "Your workspace has been successfully created.",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      setStep(2);
    } catch (error) {
      console.error("Error creating workspace:", error);
      toast({
        title: "Error creating workspace",
        description: error.response?.data?.message || "Failed to create workspace",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const fetchRoles = useCallback(async () => {
    try {
      const response = await axios.get(
        `${API_URL}/workspace/${workspaceId}/roles`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setRoleList(response.data);
    } catch (error) {
      console.error("Error fetching roles:", error);
    }
  }, [token, workspaceId]);

  const sendInvitation = (email, role) => {
    const templateParams = {
      to_email: email,
      workspace_id: workspaceId,
      workspace_name: workspaceName,
      role_name: role,
      portal_link: "http://your-portal-link.com",
    };

    emailjs
      .send(
        process.env.REACT_APP_EMAILJS_SERVICE_ID,
        process.env.REACT_APP_EMAILJS_TEMPLATE_ID,
        templateParams,
        process.env.REACT_APP_EMAILJS_USER_ID
      )
      .then(
        (result) => {
          console.log("Email sent:", result.text);
        },
        (error) => {
          console.error("Error sending email:", error.text);
        }
      );
  };

  const inviteUsers = () => {
    if (!emails.trim()) {
      toast({
        title: "Please enter at least one email",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    const emailsArray = emails.split(",").map((email) => email.trim());
    emailsArray.forEach((email) => sendInvitation(email, selectedRole));
    
    toast({
      title: "Invitations Sent",
      description: `Sent ${emailsArray.length} invitation(s)`,
      status: "success",
      duration: 3000,
      isClosable: true,
    });
    
    setEmails("");
    setSelectedRole(null);
  };

  const handleAddRole = () => {
    if (roleInput.trim() && !roles.includes(roleInput.trim())) {
      setRoles([...roles, roleInput.trim()]);
      setRoleInput("");
    }
  };

  const handleRemoveRole = (roleToRemove) => {
    setRoles(roles.filter(role => role !== roleToRemove));
  };

  useEffect(() => {
    if (step === 2 && workspaceId) {
      fetchRoles();
    }
  }, [step, workspaceId, fetchRoles]);

  const handleDone = () => {
    setIsOpen(false);
    if (workspaceId) {
      navigate(`/workspace/${workspaceId}/chats`);
    }
  };

  const handleOpen = () => {
    setIsOpen(true);
    setStep(1);
    setWorkspaceName("");
    setRoles([]);
    setRoleInput("");
    setSelectedRole(null);
    setEmails("");
    setWorkspaceId(null);
  };

  const handleModalClose = () => {
    setIsOpen(false);
    setStep(1);
  };

  return (
    <>
      <Button
        bg="#34d399"
        color="#07120e"
        alignItems="center"
        justifyContent="center"
        rounded={10}
        onClick={handleOpen}
        _hover={{ bg: "#6ee7b7" }}
      >
        Create Workspace
      </Button>

      <Modal size="lg" isOpen={isOpen} onClose={handleModalClose} isCentered>
        <ModalOverlay bg="blackAlpha.800" backdropFilter="blur(4px)" />
        <ModalContent
          pb={4}
          pt={1}
          bg="#171c1b"
          color="#eef4f1"
          border="1px solid"
          borderColor="#3a4541"
        >
          <ModalHeader color="white">
            {step === 1 ? "Create Workspace" : "Invite Users"}
          </ModalHeader>
          <ModalCloseButton color="#eef4f1" _hover={{ bg: "#2c3532" }} />
          <ModalBody>
            {step === 1 && (
              <Stack spacing={4}>
                <FormControl isRequired>
                  <FormLabel color="gray.300">Workspace Name</FormLabel>
                  <Input
                    placeholder="Enter workspace name"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
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
                  <FormLabel color="gray.300">Add Roles</FormLabel>
                  <Text color="#8f9d97" fontSize="sm" mb={2}>
                    Each role creates one private workspace channel.
                  </Text>
                  <HStack>
                    <Input
                      placeholder="Enter role name"
                      value={roleInput}
                      onChange={(e) => setRoleInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddRole();
                        }
                      }}
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
                    <Button
                      onClick={handleAddRole}
                      bg="#34d399"
                      color="#07120e"
                      _hover={{ bg: "#6ee7b7" }}
                      flexShrink={0}
                    >
                      Add
                    </Button>
                  </HStack>
                </FormControl>

                {roles.length > 0 && (
                  <Box>
                    <FormLabel color="gray.300" mb={2}>Roles Added</FormLabel>
                    <HStack spacing={2} flexWrap="wrap">
                      {roles.map((role, index) => (
                        <Tag
                          key={index}
                          size="md"
                          bg="#26332e"
                          color="#6ee7b7"
                          borderRadius="full"
                        >
                          <TagLabel>{role}</TagLabel>
                          <TagCloseButton onClick={() => handleRemoveRole(role)} />
                        </Tag>
                      ))}
                    </HStack>
                  </Box>
                )}

                <Button
                  bg="#34d399"
                  color="#07120e"
                  _hover={{ bg: "#6ee7b7" }}
                  _active={{ bg: "#10b981" }}
                  onClick={createWorkspace}
                  mt={4}
                >
                  Create & Continue
                </Button>
              </Stack>
            )}

            {step === 2 && (
              <Stack spacing={4}>
                <Box>
                  <FormLabel color="gray.300" mb={3}>Select Role to Invite Users</FormLabel>
                  <List spacing={2}>
                    {roleList.map((role, index) => (
                      <ListItem
                        key={index}
                        p={3}
                        cursor="pointer"
                        bg={selectedRole === role.roleName ? "#26332e" : "#202725"}
                        borderRadius="md"
                        border="1px solid"
                        borderColor="#3a4541"
                        _hover={{ bg: "#2c3532" }}
                        onClick={() => setSelectedRole(role.roleName)}
                      >
                        <Text color="white">{role.roleName}</Text>
                      </ListItem>
                    ))}
                  </List>
                </Box>

                {selectedRole && (
                  <Box
                    p={4}
                    bg="#202725"
                    borderRadius="md"
                    border="1px solid"
                    borderColor="#3a4541"
                  >
                    <FormControl>
                      <FormLabel color="gray.300">
                        Invite Users to {selectedRole}
                      </FormLabel>
                      <Input
                        placeholder="Enter emails separated by commas"
                        value={emails}
                        onChange={(e) => setEmails(e.target.value)}
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
                      <Button
                        mt={3}
                        bg="#34d399"
                        color="#07120e"
                        _hover={{ bg: "#6ee7b7" }}
                        onClick={inviteUsers}
                      >
                        Send Invitations
                      </Button>
                    </FormControl>
                  </Box>
                )}

                <Button
                  bg="#34d399"
                  color="#07120e"
                  _hover={{ bg: "#6ee7b7" }}
                  _active={{ bg: "#10b981" }}
                  onClick={handleDone}
                  mt={4}
                >
                  Done
                </Button>
              </Stack>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
};

export default CreateWorkspaceModal;
