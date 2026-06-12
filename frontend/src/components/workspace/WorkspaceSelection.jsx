import React from "react";
import {
  Avatar,
  AvatarGroup,
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  SimpleGrid,
  Text,
} from "@chakra-ui/react";
import { FiArrowRight, FiGrid, FiLogOut, FiPlus } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "../../Context/WorkspaceProvider";
import CreateWorkspaceModal from "./CreateWorkspaceModal";
import JoinWorkspaceModal from "./JoinWorkspaceModal";
import BrandMark from "../brand/BrandMark";

const WorkspaceSelection = () => {
  const { userWorkspaces, user } = useWorkspace();
  const navigate = useNavigate();

  const logout = () => {
    localStorage.removeItem("userInfo");
    navigate("/");
  };

  return (
    <Flex minH="100dvh" bg="#101414" direction="column">
      <Flex
        as="header"
        minH="68px"
        px={{ base: 5, md: 8 }}
        align="center"
        justify="space-between"
        borderBottom="1px solid #313b37"
      >
        <HStack spacing={3}>
          <BrandMark size="38px" />
          <Box>
            <Text fontWeight="750">ComConnect</Text>
            <Text color="#8f9d97" fontSize="xs">Workspace directory</Text>
          </Box>
        </HStack>
        <Button
          leftIcon={<FiLogOut />}
          size="sm"
          variant="ghost"
          color="#bdc8c3"
          onClick={logout}
        >
          Sign out
        </Button>
      </Flex>

      <Box w="100%" maxW="1180px" mx="auto" px={{ base: 5, md: 8 }} py={10}>
        <Flex
          align={{ base: "flex-start", md: "center" }}
          justify="space-between"
          direction={{ base: "column", md: "row" }}
          gap={5}
          mb={8}
        >
          <Box>
            <Heading fontSize={{ base: "2xl", md: "3xl" }} letterSpacing="0">
              Your workspaces
            </Heading>
            <Text color="#9eaaa5" mt={2}>
              Welcome back{user?.name ? `, ${user.name}` : ""}. Pick up where your team left off.
            </Text>
          </Box>
          <Flex gap={3} flexWrap="wrap">
            <CreateWorkspaceModal />
            <JoinWorkspaceModal>
              <Button
                leftIcon={<FiPlus />}
                variant="outline"
                borderColor="#3a4541"
                color="#dce6e1"
                _hover={{ bg: "#202725" }}
              >
                Join workspace
              </Button>
            </JoinWorkspaceModal>
          </Flex>
        </Flex>

        {userWorkspaces?.length ? (
          <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
            {userWorkspaces.map((workspace) => (
              <Flex
                key={workspace._id}
                as="button"
                type="button"
                direction="column"
                minH="190px"
                p={5}
                textAlign="left"
                bg="#171c1b"
                border="1px solid #313b37"
                borderRadius="8px"
                transition="border-color 150ms ease, background 150ms ease"
                _hover={{ bg: "#1b211f", borderColor: "#52615b" }}
                onClick={() => navigate(`/workspace/${workspace._id}/chats`)}
              >
                <Flex align="center" justify="space-between">
                  <Flex
                    w="42px"
                    h="42px"
                    align="center"
                    justify="center"
                    bg="#26332e"
                    color="#6ee7b7"
                    borderRadius="6px"
                    fontWeight="800"
                  >
                    {workspace.workspaceName?.charAt(0).toUpperCase() || "W"}
                  </Flex>
                  <FiArrowRight color="#8f9d97" />
                </Flex>
                <Text fontWeight="700" fontSize="lg" mt={5} noOfLines={1}>
                  {workspace.workspaceName}
                </Text>
                <Text color="#8f9d97" fontSize="sm" mt={1}>
                  {workspace.members?.length || 0} members
                </Text>
                <Flex mt="auto" pt={5} align="center" justify="space-between">
                  <AvatarGroup size="xs" max={4}>
                    {(workspace.members || []).map((member, index) => (
                      <Avatar
                        key={member._id || index}
                        name={member.name}
                        src={member.pic}
                        bg="#2c3532"
                      />
                    ))}
                  </AvatarGroup>
                  <Text color="#34d399" fontSize="xs" fontWeight="700">
                    Open workspace
                  </Text>
                </Flex>
              </Flex>
            ))}
          </SimpleGrid>
        ) : (
          <Flex
            minH="320px"
            align="center"
            justify="center"
            direction="column"
            border="1px dashed #46534e"
            borderRadius="8px"
            bg="#141817"
            textAlign="center"
            px={6}
          >
            <FiGrid size={28} color="#34d399" />
            <Text fontWeight="700" mt={4}>No workspaces yet</Text>
            <Text color="#8f9d97" fontSize="sm" mt={2} maxW="420px">
              Create an event workspace or join one with an invitation from your team.
            </Text>
          </Flex>
        )}
      </Box>
    </Flex>
  );
};

export default WorkspaceSelection;
