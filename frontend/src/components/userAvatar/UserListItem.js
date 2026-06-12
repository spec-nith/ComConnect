import { Avatar } from "@chakra-ui/avatar";
import { Box, Text } from "@chakra-ui/layout";

const UserListItem = ({ handleFunction,user }) => {
  // const { user } = ChatState();
  console.log("searcheduser",user);

  return (
    <Box
      onClick={handleFunction}
      cursor="pointer"
      bg="#152330ff"
      _hover={{
        background: "#21364A",
        color: "white",
      }}
      w="100%"
      display="flex"
      alignItems="center"
      color="black"
      transition="all 0.2s ease-in-out"
      px={3}
      py={2}
      mb={2}
      borderRadius="lg"
      textColor={"white"}
    >
      <Avatar
        mr={2}
        size="sm"
        cursor="pointer"
        name={user.name}
        src={user.pic}
      />
      <Box>
        <Text>{user.name}</Text>
        <Text fontSize="xs">
          <b>Email : </b>
          {user.email}
        </Text>
      </Box>
    </Box>
  );
};

export default UserListItem;
