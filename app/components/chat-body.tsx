import { useDebouncedCallback } from "use-debounce";
import React, {
  Fragment,
  useMemo,
  useRef,
  useState,
  useEffect,
  useCallback,
} from "react";
import {
  ChatMessage,
  useAppConfig,
  useChatStore,
  createMessage,
} from "../store";
import {
  ChatActions,
  PromptHints,
  ChatAction,
  ClearContextDivider,
  DeleteImageButton,
  RenderPrompt,
  useScrollToBottom,
  RenderMessage,
  useSubmitHandler,
} from "./chat";
import { CHAT_PAGE_SIZE } from "../constant";
import { Markdown } from "./markdown";
import { Avatar } from "./emoji";
import { MaskAvatar } from "./mask";
import { IconButton } from "./button";
import { showPrompt, showToast } from "./ui-lib";
import { getMessageImages, getMessageTextContent } from "../utils";
import { MultimodalContent } from "../client/api";
import { ChatControllerPool } from "../client/controller";
import { copyToClipboard } from "../utils";
import clsx from "clsx";
import styles from "./chat.module.scss";
import Locale from "../locales";

import EditIcon from "../icons/rename.svg";
import StopIcon from "../icons/pause.svg";
import ResetIcon from "../icons/reload.svg";
import DeleteIcon from "../icons/clear.svg";
import PinIcon from "../icons/pin.svg";
import CopyIcon from "../icons/copy.svg";
// import SpeakStopIcon from "../icons/speak-stop.svg";
// import SpeakIcon from "../icons/speak.svg";
import SendWhiteIcon from "../icons/send-white.svg";
import ConfirmIcon from "../icons/confirm.svg";
import LoadingButtonIcon from "../icons/loading.svg";
import CloseIcon from "../icons/close.svg";
import { TextSelectionToolbar } from "./text-selection-toolbar";
import { useChatBodyStore } from "../store/chat-body";
import { useChatCommand, ChatCommandPrefix } from "../command";
import { isEmpty } from "lodash-es";
import { useMobileScreen, isVisionModel } from "../utils";
import { uploadImage as uploadImageRemote } from "@/app/utils/chat";
// import { createTTSPlayer } from "../utils/audio";
// import { MsEdgeTTS, OUTPUT_FORMAT } from "../utils/ms_edge_tts";
import { useNavigate } from "react-router-dom";
import { usePromptStore } from "../store/prompt";

// const ttsPlayer = createTTSPlayer();

// Define props for the ChatBodyProps interface
interface ChatBodyProps {
  messages: ChatMessage[];
  context: ChatMessage[];
  clearContextIndex: number;
  fontSize: number;
  fontFamily: string;
  inputRows: number;
  autoFocus: boolean;
}

export function ChatBody(props: ChatBodyProps) {
  const {
    messages,
    context,
    clearContextIndex,
    fontSize,
    fontFamily,
    inputRows,
    autoFocus,
  } = props;
  const config = useAppConfig();
  const chatBodyStore = useChatStore();
  const session = chatBodyStore.currentSession();
  const {
    userInput,
    // promptHints,
    isLoading,
    setUserInput,
    // setPromptHints,
    setIsLoading,
  } = useChatBodyStore();

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const chatCommands = useChatCommand();

  const isScrolledToBottom = scrollRef?.current
    ? Math.abs(
        scrollRef.current.scrollHeight -
          (scrollRef.current.scrollTop + scrollRef.current.clientHeight),
      ) <= 1
    : false;

  const isAttachWithTop = useMemo(() => {
    const lastMessage = scrollRef.current?.lastElementChild as HTMLElement;
    // if scrolllRef is not ready or no message, return false
    if (!scrollRef?.current || !lastMessage) return false;
    const topDistance =
      lastMessage!.getBoundingClientRect().top -
      scrollRef.current.getBoundingClientRect().top;
    // leave some space for user question
    return topDistance < 100;
  }, [scrollRef?.current?.scrollHeight]);

  const isTyping = userInput !== "";

  // if user is typing, should auto scroll to bottom
  // if user is not typing, should auto scroll to bottom only if already at bottom
  const { setAutoScroll, scrollDomToBottom } = useScrollToBottom(
    scrollRef,
    (isScrolledToBottom || isAttachWithTop) && !isTyping,
    session.messages,
  );
  const [hitBottom, setHitBottom] = useState(true);
  const [showAskModal, setShowAskModal] = useState(false);
  // 快捷键 shortcut keys
  const [showShortcutKeyModal, setShowShortcutKeyModal] = useState(false);
  const [showChatSidePanel, setShowChatSidePanel] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);

  const isMobileScreen = useMobileScreen();
  const navigate = useNavigate();
  const [attachImages, setAttachImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const { submitKey, shouldSubmit } = useSubmitHandler();

  // preview messages
  const renderMessages = useMemo(() => {
    return context
      .concat(session.messages as RenderMessage[])
      .concat(
        isLoading
          ? [
              {
                ...createMessage({
                  role: "assistant",
                  content: "……",
                }),
                preview: true,
              },
            ]
          : [],
      )
      .concat(
        userInput.length > 0 && config.sendPreviewBubble
          ? [
              {
                ...createMessage({
                  role: "user",
                  content: userInput,
                }),
                preview: true,
              },
            ]
          : [],
      );
  }, [
    config.sendPreviewBubble,
    context,
    isLoading,
    session.messages,
    userInput,
  ]);

  const [msgRenderIndex, _setMsgRenderIndex] = useState(
    Math.max(0, renderMessages.length - CHAT_PAGE_SIZE),
  );

  function setMsgRenderIndex(newIndex: number) {
    newIndex = Math.min(renderMessages.length - CHAT_PAGE_SIZE, newIndex);
    newIndex = Math.max(0, newIndex);
    _setMsgRenderIndex(newIndex);
  }
  const onChatBodyScroll = (e: HTMLElement) => {
    const bottomHeight = e.scrollTop + e.clientHeight;
    const edgeThreshold = e.clientHeight;

    const isTouchTopEdge = e.scrollTop <= edgeThreshold;
    const isTouchBottomEdge = bottomHeight >= e.scrollHeight - edgeThreshold;
    const isHitBottom =
      bottomHeight >= e.scrollHeight - (isMobileScreen ? 4 : 10);

    const prevPageMsgIndex = msgRenderIndex - CHAT_PAGE_SIZE;
    const nextPageMsgIndex = msgRenderIndex + CHAT_PAGE_SIZE;

    if (isTouchTopEdge && !isTouchBottomEdge) {
      setMsgRenderIndex(prevPageMsgIndex);
    } else if (isTouchBottomEdge) {
      setMsgRenderIndex(nextPageMsgIndex);
    }

    setHitBottom(isHitBottom);
    setAutoScroll(isHitBottom);
  };

  function scrollToBottom() {
    setMsgRenderIndex(renderMessages.length - CHAT_PAGE_SIZE);
    scrollDomToBottom();
  }

  async function uploadImage() {
    const images: string[] = [];
    images.push(...attachImages);

    images.push(
      ...(await new Promise<string[]>((res, rej) => {
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept =
          "image/png, image/jpeg, image/webp, image/heic, image/heif";
        fileInput.multiple = true;
        fileInput.onchange = (event: any) => {
          setUploading(true);
          const files = event.target.files;
          const imagesData: string[] = [];
          for (let i = 0; i < files.length; i++) {
            const file = event.target.files[i];
            uploadImageRemote(file)
              .then((dataUrl) => {
                imagesData.push(dataUrl);
                if (
                  imagesData.length === 3 ||
                  imagesData.length === files.length
                ) {
                  setUploading(false);
                  res(imagesData);
                }
              })
              .catch((e) => {
                setUploading(false);
                rej(e);
              });
          }
        };
        fileInput.click();
      })),
    );

    const imagesLength = images.length;
    if (imagesLength > 3) {
      images.splice(3, imagesLength - 3);
    }
    setAttachImages(images);
  }

  const handlePaste = useCallback(
    async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const currentModel =
        chatBodyStore.currentSession().mask.modelConfig.model;
      if (!isVisionModel(currentModel)) {
        return;
      }
      const items = (event.clipboardData || window.clipboardData).items;
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          event.preventDefault();
          const file = item.getAsFile();
          if (file) {
            const images: string[] = [];
            images.push(...attachImages);
            images.push(
              ...(await new Promise<string[]>((res, rej) => {
                setUploading(true);
                const imagesData: string[] = [];
                uploadImageRemote(file)
                  .then((dataUrl) => {
                    imagesData.push(dataUrl);
                    setUploading(false);
                    res(imagesData);
                  })
                  .catch((e) => {
                    setUploading(false);
                    rej(e);
                  });
              })),
            );
            const imagesLength = images.length;

            if (imagesLength > 3) {
              images.splice(3, imagesLength - 3);
            }
            setAttachImages(images);
          }
        }
      }
    },
    [attachImages, chatBodyStore],
  );

  // 文本选择
  const [selectedRange, setSelectedRange] = useState<Range | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [showTextSelectionToolbar, setShowTextSelectionToolbar] =
    useState(false);

  const handleTextSelection = useDebouncedCallback(() => {
    const selection = window.getSelection();

    const container = scrollRef.current;
    if (!container || !selection || selection.rangeCount === 0) {
      setShowTextSelectionToolbar(false);
      return;
    }

    const range = selection.getRangeAt(0);
    const text = selection.toString();

    if (
      container.contains(range.commonAncestorContainer) &&
      text.trim().length > 0
    ) {
      setSelectedRange(range.cloneRange());
      setSelectedText(text);
      setShowTextSelectionToolbar(true);
    } else {
      setShowTextSelectionToolbar(false);
    }
  }, 200);

  useEffect(() => {
    document.addEventListener("selectionchange", handleTextSelection);

    return () => {
      document.removeEventListener("selectionchange", handleTextSelection);
    };
  }, [handleTextSelection]);

  // prompt hints
  const promptStore = usePromptStore();
  const [promptHints, setPromptHints] = useState<RenderPrompt[]>([]);
  const onSearch = useDebouncedCallback(
    (text: string) => {
      const matchedPrompts = promptStore.search(text);
      setPromptHints(matchedPrompts);
    },
    100,
    { leading: true, trailing: true },
  );

  // only search prompts when user input is short
  const SEARCH_TEXT_LIMIT = 30;
  const onInput = (text: string) => {
    setUserInput(text);
    const n = text.trim().length;

    // clear search results
    if (n === 0) {
      setPromptHints([]);
    } else if (text.match(ChatCommandPrefix)) {
      setPromptHints(chatCommands.search(text));
    } else if (!config.disablePromptHint && n < SEARCH_TEXT_LIMIT) {
      // check if need to trigger auto completion
      if (text.startsWith("/")) {
        let searchText = text.slice(1);
        onSearch(searchText);
      }
    }
  };

  const doSubmit = (input: string) => {
    if (input.trim() === "" && isEmpty(attachImages)) return;
    const matchCommand = chatCommands.match(input);
    if (matchCommand.matched) {
      setUserInput("");
      setPromptHints([]);
      matchCommand.invoke();
      return;
    }
    setIsLoading(true);
    chatBodyStore
      .onUserInput(input, attachImages)
      .then(() => setIsLoading(false));
    setAttachImages([]);
    chatBodyStore.setLastInput(input);
    setUserInput("");
    setPromptHints([]);
    if (!isMobileScreen) inputRef.current?.focus();
    setAutoScroll(true);
  };

  const onPromptSelect = (prompt: RenderPrompt) => {
    setTimeout(() => {
      setPromptHints([]);

      const matchedChatCommand = chatCommands.match(prompt.content);
      if (matchedChatCommand.matched) {
        // if user is selecting a chat command, just trigger it
        matchedChatCommand.invoke();
        setUserInput("");
      } else {
        // or fill the prompt
        setUserInput(prompt.content);
      }
      inputRef.current?.focus();
    }, 30);
  };

  // stop response
  const onUserStop = (messageId: string) => {
    ChatControllerPool.stop(session.id, messageId);
  };

  // check if should send message
  const onInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // if ArrowUp and no userInput, fill with last input
    if (
      e.key === "ArrowUp" &&
      userInput.length <= 0 &&
      !(e.metaKey || e.altKey || e.ctrlKey)
    ) {
      setUserInput(chatBodyStore.lastInput ?? "");
      e.preventDefault();
      return;
    }
    if (shouldSubmit(e) && promptHints.length === 0) {
      doSubmit(userInput);
      e.preventDefault();
    }
  };

  const deleteMessage = (msgId?: string) => {
    chatBodyStore.updateTargetSession(
      session,
      (session) =>
        (session.messages = session.messages.filter((m) => m.id !== msgId)),
    );
  };

  const onDelete = (msgId: string) => {
    deleteMessage(msgId);
  };

  const onResend = (message: ChatMessage) => {
    // when it is resending a message
    // 1. for a user's message, find the next bot response
    // 2. for a bot's message, find the last user's input
    // 3. delete original user input and bot's message
    // 4. resend the user's input

    const resendingIndex = session.messages.findIndex(
      (m) => m.id === message.id,
    );

    if (resendingIndex < 0 || resendingIndex >= session.messages.length) {
      console.error("[Chat] failed to find resending message", message);
      return;
    }

    let userMessage: ChatMessage | undefined;
    let botMessage: ChatMessage | undefined;

    if (message.role === "assistant") {
      // if it is resending a bot's message, find the user input for it
      botMessage = message;
      for (let i = resendingIndex; i >= 0; i -= 1) {
        if (session.messages[i].role === "user") {
          userMessage = session.messages[i];
          break;
        }
      }
    } else if (message.role === "user") {
      // if it is resending a user's input, find the bot's response
      userMessage = message;
      for (let i = resendingIndex; i < session.messages.length; i += 1) {
        if (session.messages[i].role === "assistant") {
          botMessage = session.messages[i];
          break;
        }
      }
    }

    if (userMessage === undefined) {
      console.error("[Chat] failed to resend", message);
      return;
    }

    // delete the original messages
    deleteMessage(userMessage.id);
    deleteMessage(botMessage?.id);

    // resend the message
    setIsLoading(true);
    const textContent = getMessageTextContent(userMessage);
    const images = getMessageImages(userMessage);
    chatBodyStore
      .onUserInput(textContent, images)
      .then(() => setIsLoading(false));
    inputRef.current?.focus();
  };

  const onPinMessage = (message: ChatMessage) => {
    chatBodyStore.updateTargetSession(session, (session) =>
      session.mask.context.push(message),
    );

    showToast(Locale.Chat.Actions.PinToastContent, {
      text: Locale.Chat.Actions.PinToastAction,
      onClick: () => {
        setShowPromptModal(true);
      },
    });
  };

  return (
    <div className={styles["chat-body-container"]}>
      {showTextSelectionToolbar && selectedRange && (
        <TextSelectionToolbar
          range={selectedRange}
          text={selectedText}
          onClose={() => {
            setShowTextSelectionToolbar(false);
            window.getSelection()?.removeAllRanges();
          }}
          onAsk={(text: string) => {
            setUserInput(`"${text}"`);
            inputRef.current?.focus();
          }}
          setShowAskModal={setShowAskModal}
        />
      )}
      <div
        className={styles["chat-body"]}
        ref={scrollRef}
        onScroll={(e) => onChatBodyScroll(e.currentTarget)}
        onMouseDown={() => inputRef.current?.blur()}
        onTouchStart={() => {
          inputRef.current?.blur();
          setAutoScroll(false);
        }}
      >
        {messages
          // TODO
          // .filter((m) => !m.isMcpResponse)
          .map((message, i) => {
            const isUser = message.role === "user";
            const isContext = i < context.length;
            const showActions =
              i > 0 &&
              !(message.preview || message.content.length === 0) &&
              !isContext;
            const showTyping = message.preview || message.streaming;

            const shouldShowClearContextDivider = i === clearContextIndex - 1;

            return (
              <Fragment key={message.id}>
                <div
                  id={`message-${message.id}`}
                  className={
                    isUser
                      ? styles["chat-message-user"]
                      : styles["chat-message"]
                  }
                >
                  <div className={styles["chat-message-container"]}>
                    <div className={styles["chat-message-header"]}>
                      <div className={styles["chat-message-avatar"]}>
                        <div className={styles["chat-message-edit"]}>
                          <IconButton
                            icon={<EditIcon />}
                            aria={Locale.Chat.Actions.Edit}
                            onClick={async () => {
                              const newMessage = await showPrompt(
                                Locale.Chat.Actions.Edit,
                                getMessageTextContent(message),
                                10,
                              );
                              let newContent: string | MultimodalContent[] =
                                newMessage;
                              const images = getMessageImages(message);
                              if (images.length > 0) {
                                newContent = [
                                  { type: "text", text: newMessage },
                                ];
                                for (let i = 0; i < images.length; i++) {
                                  newContent.push({
                                    type: "image_url",
                                    image_url: {
                                      url: images[i],
                                    },
                                  });
                                }
                              }
                              chatBodyStore.updateTargetSession(
                                session,
                                (session) => {
                                  const m = session.mask.context
                                    .concat(session.messages)
                                    .find((m) => m.id === message.id);
                                  if (m) {
                                    m.content = newContent;
                                  }
                                },
                              );
                            }}
                          ></IconButton>
                        </div>
                        {isUser ? (
                          <Avatar avatar={config.avatar} />
                        ) : (
                          <>
                            {["system"].includes(message.role) ? (
                              <Avatar avatar="2699-fe0f" />
                            ) : (
                              <MaskAvatar
                                avatar={session.mask.avatar}
                                model={
                                  message.model ||
                                  session.mask.modelConfig.model
                                }
                              />
                            )}
                          </>
                        )}
                      </div>
                      {!isUser && (
                        <div className={styles["chat-model-name"]}>
                          {message.model}
                        </div>
                      )}

                      {showActions && (
                        <div className={styles["chat-message-actions"]}>
                          <div className={styles["chat-input-actions"]}>
                            {message.streaming ? (
                              <ChatAction
                                text={Locale.Chat.Actions.Stop}
                                icon={<StopIcon />}
                                onClick={() => onUserStop(message.id ?? i)}
                              />
                            ) : (
                              <>
                                <ChatAction
                                  text={Locale.Chat.Actions.Retry}
                                  icon={<ResetIcon />}
                                  onClick={() => onResend(message)}
                                />

                                <ChatAction
                                  text={Locale.Chat.Actions.Delete}
                                  icon={<DeleteIcon />}
                                  onClick={() => onDelete(message.id ?? i)}
                                />

                                <ChatAction
                                  text={Locale.Chat.Actions.Pin}
                                  icon={<PinIcon />}
                                  onClick={() => onPinMessage(message)}
                                />
                                <ChatAction
                                  text={Locale.Chat.Actions.Copy}
                                  icon={<CopyIcon />}
                                  onClick={() =>
                                    copyToClipboard(
                                      getMessageTextContent(message),
                                    )
                                  }
                                />
                                {/* {config.ttsConfig.enable && (
                                  <ChatAction
                                    text={
                                      speechStatus
                                        ? Locale.Chat.Actions.StopSpeech
                                        : Locale.Chat.Actions.Speech
                                    }
                                    icon={
                                      speechStatus ? (
                                        <SpeakStopIcon />
                                      ) : (
                                        <SpeakIcon />
                                      )
                                    }
                                    onClick={() =>
                                      openaiSpeech(
                                        getMessageTextContent(message),
                                      )
                                    }
                                  />
                                )} */}
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    {message?.tools?.length == 0 &&
                      (message.preview || message.streaming) && (
                        <div className={styles["chat-message-status"]}>
                          {Locale.Chat.Typing}
                        </div>
                      )}
                    {/*@ts-ignore*/}
                    {message?.tools?.length > 0 && (
                      <div className={styles["chat-message-tools"]}>
                        {message?.tools?.map((tool) => (
                          <div
                            key={tool.id}
                            title={tool?.errorMsg}
                            className={styles["chat-message-tool"]}
                          >
                            {tool.isError === false ? (
                              <ConfirmIcon />
                            ) : tool.isError === true ? (
                              <CloseIcon />
                            ) : (
                              <LoadingButtonIcon />
                            )}
                            <span>{tool?.function?.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className={styles["chat-message-item"]}>
                      <Markdown
                        key={message.streaming ? "loading" : "done"}
                        content={getMessageTextContent(message)}
                        loading={
                          (message.preview || message.streaming) &&
                          message.content.length === 0 &&
                          !isUser
                        }
                        //   onContextMenu={(e) => onRightClick(e, message)} // hard to use
                        onDoubleClickCapture={() => {
                          if (!isMobileScreen) return;
                          setUserInput(getMessageTextContent(message));
                        }}
                        fontSize={fontSize}
                        fontFamily={fontFamily}
                        parentRef={scrollRef}
                        defaultShow={i >= messages.length - 6}
                      />
                      {getMessageImages(message).length == 1 && (
                        <img
                          className={styles["chat-message-item-image"]}
                          src={getMessageImages(message)[0]}
                          alt=""
                        />
                      )}
                      {getMessageImages(message).length > 1 && (
                        <div
                          className={styles["chat-message-item-images"]}
                          style={
                            {
                              "--image-count": getMessageImages(message).length,
                            } as React.CSSProperties
                          }
                        >
                          {getMessageImages(message).map((image, index) => {
                            return (
                              <img
                                className={
                                  styles["chat-message-item-image-multi"]
                                }
                                key={index}
                                src={image}
                                alt=""
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {message?.audio_url && (
                      <div className={styles["chat-message-audio"]}>
                        <audio src={message.audio_url} controls />
                      </div>
                    )}

                    <div className={styles["chat-message-action-date"]}>
                      {isContext
                        ? Locale.Chat.IsContext
                        : message.date.toLocaleString()}
                    </div>
                  </div>
                </div>
                {shouldShowClearContextDivider && <ClearContextDivider />}
              </Fragment>
            );
          })}
      </div>
      <div className={styles["chat-input-panel"]}>
        <PromptHints prompts={promptHints} onPromptSelect={onPromptSelect} />

        <ChatActions
          uploadImage={uploadImage}
          setAttachImages={setAttachImages}
          setUploading={setUploading}
          showPromptModal={() => {}}
          scrollToBottom={scrollToBottom}
          hitBottom={hitBottom}
          uploading={uploading}
          showPromptHints={() => {
            if (promptHints.length > 0) {
              setPromptHints([]);
              return;
            }
            inputRef.current?.focus();
            setUserInput("/");
          }}
          setShowShortcutKeyModal={setShowShortcutKeyModal}
          setUserInput={setUserInput}
          setShowChatSidePanel={setShowChatSidePanel}
        />
        <label
          className={clsx(styles["chat-input-panel-inner"], {
            [styles["chat-input-panel-inner-attach"]]:
              attachImages.length !== 0,
          })}
          htmlFor="chat-input"
        >
          <textarea
            id="chat-input"
            ref={inputRef}
            className={styles["chat-input"]}
            placeholder={Locale.Chat.Input(submitKey)}
            onInput={(e) => onInput(e.currentTarget.value)}
            value={userInput}
            onKeyDown={onInputKeyDown}
            onFocus={scrollToBottom}
            onClick={scrollToBottom}
            onPaste={handlePaste}
            rows={inputRows}
            autoFocus={autoFocus}
            style={{
              fontSize: config.fontSize,
              fontFamily: config.fontFamily,
            }}
          />
          {attachImages.length != 0 && (
            <div className={styles["attach-images"]}>
              {attachImages.map((image, index) => {
                return (
                  <div
                    key={index}
                    className={styles["attach-image"]}
                    style={{ backgroundImage: `url("${image}")` }}
                  >
                    <div className={styles["attach-image-mask"]}>
                      <DeleteImageButton
                        deleteImage={() => {
                          setAttachImages(
                            attachImages.filter((_, i) => i !== index),
                          );
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {/* 发送按钮 */}
          <IconButton
            icon={<SendWhiteIcon />}
            text={Locale.Chat.Send}
            className={styles["chat-input-send"]}
            type="primary"
            onClick={() => doSubmit(userInput)}
          />
        </label>
      </div>
    </div>
  );
}
