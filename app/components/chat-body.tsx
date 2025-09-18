import React, { Fragment, RefObject } from "react";
import { ChatMessage, useAppConfig, useChatStore, ChatSession } from "../store";
import {
  ChatActions,
  PromptHints,
  ChatAction,
  ClearContextDivider,
  DeleteImageButton,
  RenderPrompt,
} from "./chat";
import { Markdown } from "./markdown";
import { Avatar } from "./emoji";
import { MaskAvatar } from "./mask";
import { IconButton } from "./button";
import { showPrompt } from "./ui-lib";
import { getMessageImages, getMessageTextContent } from "../utils";
import { MultimodalContent } from "../client/api";
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
import SpeakStopIcon from "../icons/speak-stop.svg";
import SpeakIcon from "../icons/speak.svg";
import SendWhiteIcon from "../icons/send-white.svg";
import ConfirmIcon from "../icons/confirm.svg";
import LoadingButtonIcon from "../icons/loading.svg";
import CloseIcon from "../icons/close.svg";
import { TextSelectionToolbar } from "./text-selection-toolbar";

// Define props for the ChatBody component
interface ChatBodyProps {
  session: ChatSession;
  showTextSelectionToolbar: boolean;
  setShowTextSelectionToolbar: (show: boolean) => void;
  selectedRange: Range | null;
  selectedText: string;
  setUserInput: (input: string) => void;
  inputRef: RefObject<HTMLTextAreaElement>;
  setShowAskModal: (show: boolean) => void;
  scrollRef: RefObject<HTMLDivElement>;
  onChatBodyScroll: (e: HTMLDivElement) => void;
  setAutoScroll: (auto: boolean) => void;
  messages: ChatMessage[];
  context: ChatMessage[];
  clearContextIndex: number;
  onUserStop: (messageId: string | number) => void;
  onResend: (message: ChatMessage) => void;
  onDelete: (messageId: string | number) => void;
  onPinMessage: (message: ChatMessage) => void;
  speechStatus: boolean;
  openaiSpeech: (content: string) => void;
  isMobileScreen: boolean;
  fontSize: number;
  fontFamily: string;
  promptHints: RenderPrompt[];
  onPromptSelect: (prompt: RenderPrompt) => void;
  uploadImage: () => void;
  setAttachImages: (images: string[]) => void;
  setUploading: (uploading: boolean) => void;
  setShowPromptModal: (show: boolean) => void;
  scrollToBottom: () => void;
  hitBottom: boolean;
  uploading: boolean;
  onSearch: (text: string) => void;
  setShowShortcutKeyModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowChatSidePanel: React.Dispatch<React.SetStateAction<boolean>>;
  attachImages: string[];
  submitKey: string;
  onInput: (text: string) => void;
  userInput: string;
  onInputKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handlePaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  inputRows: number;
  autoFocus: boolean;
  doSubmit: (input: string) => void;
  setPromptHints: (hints: RenderPrompt[]) => void;
}

export function ChatBody(props: ChatBodyProps) {
  const {
    session,
    showTextSelectionToolbar,
    setShowTextSelectionToolbar,
    selectedRange,
    selectedText,
    setUserInput,
    inputRef,
    setShowAskModal,
    scrollRef,
    onChatBodyScroll,
    setAutoScroll,
    messages,
    context,
    clearContextIndex,
    onUserStop,
    onResend,
    onDelete,
    onPinMessage,
    speechStatus,
    openaiSpeech,
    isMobileScreen,
    fontSize,
    fontFamily,
    promptHints,
    onPromptSelect,
    uploadImage,
    setAttachImages,
    setUploading,
    setShowPromptModal,
    scrollToBottom,
    hitBottom,
    uploading,
    onSearch,
    setShowShortcutKeyModal,
    setShowChatSidePanel,
    attachImages,
    submitKey,
    onInput,
    userInput,
    onInputKeyDown,
    handlePaste,
    inputRows,
    autoFocus,
    doSubmit,
    setPromptHints,
  } = props;
  const config = useAppConfig();
  const chatStore = useChatStore();

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
                              chatStore.updateTargetSession(
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
                                {config.ttsConfig.enable && (
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
                                )}
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
          showPromptModal={() => setShowPromptModal(true)}
          scrollToBottom={scrollToBottom}
          hitBottom={hitBottom}
          uploading={uploading}
          showPromptHints={() => {
            // Click again to close
            if (promptHints.length > 0) {
              setPromptHints([]);
              return;
            }

            inputRef.current?.focus();
            setUserInput("/");
            onSearch("");
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
