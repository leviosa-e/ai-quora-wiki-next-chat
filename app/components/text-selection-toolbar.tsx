import { useEffect, useRef, useState } from "react";
import { Modal, Input } from "antd";
import styles from "./text-selection-toolbar.module.scss";
import { IconButton } from "./button";
import CopyIcon from "../icons/copy.svg";
import PromptIcon from "../icons/prompt.svg";
import EditIcon from "../icons/rename.svg";
import { copyToClipboard } from "../utils";
import Locale from "../locales";

interface TextSelectionToolbarProps {
  range: Range;
  text: string;
  onClose: () => void;
  onAsk: (text: string) => void;
  // onHighlight: () => void;
}

export function TextSelectionToolbar({
  range,
  text,
  onClose,
  onAsk, // onHighlight,
}: TextSelectionToolbarProps) {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [askInput, setAskInput] = useState("");
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (range && toolbarRef.current) {
      const rect = range.getBoundingClientRect();
      const toolbarRect = toolbarRef.current.getBoundingClientRect();

      let top = rect.top - toolbarRect.height - 10;
      if (top < 10) {
        top = rect.bottom + 10;
      }
      let left = rect.left + rect.width / 2 - toolbarRect.width / 2;
      if (left < 10) {
        left = 10;
      }
      if (left + toolbarRect.width > window.innerWidth - 10) {
        left = window.innerWidth - toolbarRect.width - 10;
      }

      setPosition({ top, left });
    }
  }, [range]);

  const handleCopy = () => {
    if (text) {
      copyToClipboard(text);
      onClose();
    }
  };

  const handleAsk = () => {
    onAsk(text);
    onClose();
  };

  const handleHighlight = () => {
    if (range) {
      const span = document.createElement("span");
      span.style.textDecoration = "underline";
      span.style.textDecorationStyle = "wavy";
      span.style.textDecorationColor = "red";
      try {
        range.surroundContents(span);
      } catch (e) {
        console.error("Failed to highlight text:", e);
      }
    }
    onClose();
  };

  const handleAskModal = () => {
    setAskInput(text);
    setIsModalVisible(true);
  };

  const handleModalSend = () => {
    onAsk(askInput);
    setIsModalVisible(false);
  };

  const handleModalCancel = () => {
    setIsModalVisible(false);
  };

  return (
    <>
      <div
        className={styles["text-selection-toolbar"]}
        ref={toolbarRef}
        style={{ top: position.top, left: position.left }}
        onMouseDown={(e) => e.preventDefault()}
      >
        <IconButton
          icon={<PromptIcon />}
          onClick={handleAskModal}
          // text={Locale.Chat.Ask}
        />
        <IconButton
          icon={<CopyIcon />}
          onClick={handleCopy}
          // text={Locale.Chat.Copy}
        />
        <IconButton
          icon={<EditIcon />}
          onClick={handleHighlight}
          // text={Locale.Chat.Highlight}
        />
      </div>
      <Modal
        title={Locale.Chat.AskQuestion}
        open={isModalVisible}
        onOk={handleModalSend}
        onCancel={handleModalCancel}
        destroyOnClose
      >
        <Input.TextArea
          value={askInput}
          onChange={(e) => setAskInput(e.target.value)}
          rows={4}
          placeholder={Locale.Chat.InputPlaceholder}
        />
      </Modal>
    </>
  );
}
