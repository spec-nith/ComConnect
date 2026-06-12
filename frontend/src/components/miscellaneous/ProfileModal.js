import { ViewIcon } from "@chakra-ui/icons";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  IconButton,
  Text,
  Image,
  Badge,
  Flex,
} from "@chakra-ui/react";
import { Box } from "@chakra-ui/layout";
import BrandMark from "../brand/BrandMark";

const ProfileModal = ({ user, children }) => {
  const { isOpen, onOpen, onClose } = useDisclosure();

  return (
    <>
      {children ? (
        <span onClick={onOpen}>{children}</span>
      ) : (
        <IconButton
          mx={"1.5"}
          d={{ base: "flex" }}
          icon={<ViewIcon />}
          onClick={onOpen}
        />
      )}
      <Modal size="lg" onClose={onClose} isOpen={isOpen} isCentered>
        <ModalOverlay bg="blackAlpha.800" backdropFilter="blur(4px)" />
        <ModalContent
          color="#eef4f1"
          border="1px solid #3a4541"
          bg="#171c1b"
        >
          <ModalHeader
            fontSize="lg"
            borderBottom="1px solid #313b37"
          >
            Member profile
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody py={7}>
            <Flex direction={{ base: "column", sm: "row" }} align="center" gap={6}>
              <Box position="relative">
                <Image
                  borderRadius="full"
                  boxSize="112px"
                  objectFit="cover"
                  border="3px solid #26332e"
                  src={user.pic}
                  alt={user.name}
                />
                <Box
                  position="absolute"
                  right="4px"
                  bottom="4px"
                  borderRadius="full"
                  border="3px solid #171c1b"
                >
                  <BrandMark size="24px" borderRadius="full" boxShadow="none" />
                </Box>
              </Box>
              <Box textAlign={{ base: "center", sm: "left" }} minW={0}>
                <Badge bg="#26332e" color="#6ee7b7" mb={2}>
                  ComConnect member
                </Badge>
                <Text fontSize="2xl" fontWeight="750">
                  {user.name}
                </Text>
                <Text mt={1} fontSize="sm" color="#9eaaa5" wordBreak="break-word">
                  {user.email}
                </Text>
              </Box>
            </Flex>
          </ModalBody>
          <ModalFooter borderTop="1px solid #313b37" py={3}>
            <Text color="#6f7d77" fontSize="xs">Workspace identity</Text>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default ProfileModal;
