import { Avatar, Spinner, Tooltip } from "@chakra-ui/react";
import ScrollableFeed from "react-scrollable-feed";
import {
  isLastMessage,
  isSameSender,
  isSameSenderMargin,
  isSameUser,
} from "../config/ChatLogics";
import { ChatState } from "../Context/ChatProvider";

const ScrollableChat = ({ messages, pendingMessages = [] }) => {
  const { user } = ChatState();
  const allMessages = [...messages, ...pendingMessages];

  return (
    <ScrollableFeed>
      <div className="message-feed">
        {allMessages.map((message, index) => {
          const mine = message.sender._id === user._id;
          const showAvatar =
            isSameSender(allMessages, message, index, user._id) ||
            isLastMessage(allMessages, index, user._id);

          return (
            <div className="message-row" key={message._id}>
              {showAvatar && (
                <Tooltip label={message.sender.name} placement="bottom-start" hasArrow>
                  <Avatar
                    mt="7px"
                    mr={2}
                    size="xs"
                    cursor="pointer"
                    name={message.sender.name}
                    src={message.sender.pic}
                  />
                </Tooltip>
              )}
              <span
                className={`message-bubble ${mine ? "message-bubble--mine" : ""}`}
                style={{
                  marginLeft: isSameSenderMargin(
                    allMessages,
                    message,
                    index,
                    user._id
                  ),
                  marginTop: isSameUser(allMessages, message, index, user._id)
                    ? 3
                    : 10,
                  opacity: message.isPending ? 0.62 : 1,
                }}
              >
                {message.content}
                {message.isPending && (
                  <Spinner size="xs" color="currentColor" thickness="2px" />
                )}
              </span>
            </div>
          );
        })}
      </div>
    </ScrollableFeed>
  );
};

export default ScrollableChat;
