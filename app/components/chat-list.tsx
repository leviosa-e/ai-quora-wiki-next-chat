import DeleteIcon from "../icons/delete.svg";
import styles from "./home.module.scss";
import {
  DragDropContext,
  Droppable,
  Draggable,
  OnDragEndResponder,
} from "@hello-pangea/dnd";
import { useChatStore } from "../store";
import Locale from "../locales";
import { useLocation, useNavigate } from "react-router-dom";
import { Path } from "../constant";
import { MaskAvatar } from "./mask";
import { Mask } from "../store/mask";
import { useRef, useEffect, useMemo, useState } from "react";
import { showConfirm } from "./ui-lib";
import { useMobileScreen } from "../utils";
import clsx from "clsx";
import { IconButton } from "./button";
import EditIcon from "../icons/edit.svg";
import LeftArrowIcon from "../icons/left.svg";

export function ChatItem(props: {
  onClick?: () => void;
  onDelete?: () => void;
  title: string;
  count: number;
  time: string;
  selected: boolean;
  id: string;
  index: number;
  narrow?: boolean;
  mask: Mask;
  groupId?: string;
}) {
  const draggableRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (props.selected && draggableRef.current) {
      draggableRef.current?.scrollIntoView({
        block: "center",
      });
    }
  }, [props.selected]);

  const { pathname: currentPath } = useLocation();
  return (
    <Draggable draggableId={`${props.id}`} index={props.index}>
      {(provided) => (
        <div
          className={clsx(
            styles["chat-item"],
            props.groupId && styles["chat-item-grouped"],
            {
              [styles["chat-item-selected"]]:
                props.selected &&
                (currentPath === Path.Chat || currentPath === Path.Home),
            },
          )}
          onClick={props.onClick}
          ref={(ele) => {
            draggableRef.current = ele;
            provided.innerRef(ele);
          }}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          title={`${props.title}\n${Locale.ChatItem.ChatItemCount(
            props.count,
          )}`}
        >
          {props.narrow ? (
            <div className={styles["chat-item-narrow"]}>
              <div className={clsx(styles["chat-item-avatar"], "no-dark")}>
                <MaskAvatar
                  avatar={props.mask.avatar}
                  model={props.mask.modelConfig.model}
                />
              </div>
              <div className={styles["chat-item-narrow-count"]}>
                {props.count}
              </div>
            </div>
          ) : (
            <>
              <div className={styles["chat-item-title"]}>{props.title}</div>
              <div className={styles["chat-item-info"]}>
                <div className={styles["chat-item-count"]}>
                  {Locale.ChatItem.ChatItemCount(props.count)}
                </div>
                <div className={styles["chat-item-date"]}>{props.time}</div>
              </div>
            </>
          )}

          <div
            className={styles["chat-item-delete"]}
            onClickCapture={(e) => {
              props.onDelete?.();
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <DeleteIcon />
          </div>
        </div>
      )}
    </Draggable>
  );
}

export function ChatList(props: { narrow?: boolean }) {
  const {
    sessions,
    groups,
    currentSessionIndex,
    selectSession,
    moveSession,
    deleteSession,
    renameGroup,
    deleteGroup,
    toggleGroup,
    updateSessionGroupId,
  } = useChatStore();
  const chatStore = useChatStore();
  const navigate = useNavigate();
  const isMobileScreen = useMobileScreen();

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  const onDragEnd: OnDragEndResponder = (result) => {
    const { destination, source, draggableId } = result;
    if (!destination) {
      return;
    }

    const sourceGroupId = source.droppableId;
    const destGroupId = destination.droppableId;

    if (sourceGroupId === destGroupId) {
      // move in the same group
      const groupSessions = sessions.filter(
        (s) => (s.groupId ?? "ungrouped") === sourceGroupId,
      );
      const sourceIndex = groupSessions.findIndex((s) => s.id === draggableId);
      const destIndex = destination.index;
      const sourceSession = groupSessions[sourceIndex];

      const globalSourceIndex = sessions.indexOf(sourceSession);
      const globalDestIndex = sessions.indexOf(groupSessions[destIndex]);

      moveSession(globalSourceIndex, globalDestIndex);
    } else {
      // move to another group
      updateSessionGroupId(
        draggableId,
        destGroupId === "ungrouped" ? undefined : destGroupId,
      );
    }
  };

  const ungroupedSessions = useMemo(
    () => sessions.filter((s) => !s.groupId),
    [sessions],
  );

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="ungrouped" type="CHAT_LIST">
        {(provided) => (
          <div
            className={styles["chat-list"]}
            ref={provided.innerRef}
            {...provided.droppableProps}
          >
            {ungroupedSessions.map((item, i) => (
              <ChatItem
                title={item.topic}
                time={new Date(item.lastUpdate).toLocaleString()}
                count={item.messages.length}
                key={item.id}
                id={item.id}
                index={i}
                selected={sessions[currentSessionIndex]?.id === item.id}
                onClick={() => {
                  navigate(Path.Chat);
                  selectSession(sessions.indexOf(item));
                }}
                onDelete={async () => {
                  if (
                    (!props.narrow && !isMobileScreen) ||
                    (await showConfirm(Locale.Home.DeleteChat))
                  ) {
                    deleteSession(sessions.indexOf(item));
                  }
                }}
                narrow={props.narrow}
                mask={item.mask}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
      {groups.map((group) => (
        <div key={group.id} className={styles["chat-group"]}>
          <div
            className={styles["chat-group-header"]}
            onClick={() => toggleGroup(group.id)}
          >
            <div className={styles["chat-group-title"]}>
              <IconButton
                icon={<LeftArrowIcon style={{ transform: "rotate(90deg)" }} />}
                className={clsx(
                  styles["chat-group-expand"],
                  group.expanded && styles["expanded"],
                )}
              />
              {editingGroupId === group.id ? (
                <input
                  type="text"
                  defaultValue={group.name}
                  onBlur={(e) => {
                    renameGroup(group.id, e.target.value);
                    setEditingGroupId(null);
                  }}
                  autoFocus
                  className={styles["chat-group-input"]}
                />
              ) : (
                <span>{group.name}</span>
              )}
            </div>
            <div className={styles["chat-group-actions"]}>
              <IconButton
                icon={<EditIcon />}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingGroupId(group.id);
                }}
              />
              <IconButton
                icon={<DeleteIcon />}
                onClick={async (e) => {
                  e.stopPropagation();
                  if (await showConfirm(Locale.Home.DeleteGroup)) {
                    deleteGroup(group.id);
                  }
                }}
              />
            </div>
          </div>
          {group.expanded && (
            <Droppable droppableId={group.id} type="CHAT_LIST">
              {(provided) => (
                <div
                  className={styles["chat-list"]}
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                >
                  {sessions
                    .filter((s) => s.groupId === group.id)
                    .map((item, i) => (
                      <ChatItem
                        title={item.topic}
                        time={new Date(item.lastUpdate).toLocaleString()}
                        count={item.messages.length}
                        key={item.id}
                        id={item.id}
                        index={i}
                        selected={sessions[currentSessionIndex]?.id === item.id}
                        onClick={() => {
                          navigate(Path.Chat);
                          selectSession(sessions.indexOf(item));
                        }}
                        onDelete={async () => {
                          if (
                            (!props.narrow && !isMobileScreen) ||
                            (await showConfirm(Locale.Home.DeleteChat))
                          ) {
                            deleteSession(sessions.indexOf(item));
                          }
                        }}
                        narrow={props.narrow}
                        mask={item.mask}
                        groupId={group.id}
                      />
                    ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          )}
        </div>
      ))}
    </DragDropContext>
  );
}
