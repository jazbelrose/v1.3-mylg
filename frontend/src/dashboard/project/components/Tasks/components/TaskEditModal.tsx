import React from "react";
import { AutoComplete, Form, Input, Modal, Select } from "antd";
import type { FormInstance } from "antd/es/form";

import styles from "../TasksComponentMobile.module.css";
import { STATUS_OPTIONS, parseDueDate } from "../utils";
import type { NominatimSuggestion, Status } from "../types";
import {
  createTaskStatusContext,
  getTaskStatusBadge,
  getTaskStatusTone,
  type TaskStatusTone,
} from "./quickTaskUtils";
import LocationSearchInput from "./LocationSearchInput";

const BADGE_CLASS_BY_TONE: Record<TaskStatusTone, string> = {
  success: "statusBadgeSuccess",
  danger: "statusBadgeDanger",
  warning: "statusBadgeWarning",
  neutral: "statusBadgeNeutral",
};

type TaskEditModalProps = {
  open: boolean;
  isEditing: boolean;
  form: FormInstance;
  taskNameOptions: { label: string; value: string }[];
  assigneeOptions: { value: string; label: string }[];
  budgetOptions: { value: string; label: string; elementId: string }[];
  locationSearch: string;
  locationSuggestions: NominatimSuggestion[];
  locationDisplay: string;
  selectedAddress: string;
  onLocationSearchChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onLocationSuggestionSelect: (suggestion: NominatimSuggestion) => void;
  onOk: () => void;
  onCancel: () => void;
};

const TaskEditModal: React.FC<TaskEditModalProps> = ({
  open,
  isEditing,
  form,
  taskNameOptions,
  assigneeOptions,
  budgetOptions,
  locationSearch,
  locationSuggestions,
  locationDisplay,
  selectedAddress,
  onLocationSearchChange,
  onLocationSuggestionSelect,
  onOk,
  onCancel,
}) => {
  const statusValue = Form.useWatch<Status | undefined>("status", form);
  const dueDateValue = Form.useWatch<string | number | Date | null | undefined>("dueDate", form);
  const dueDate = parseDueDate(dueDateValue ?? null);
  const { category, label } = getTaskStatusBadge(
    statusValue ?? "todo",
    dueDate,
    createTaskStatusContext(),
  );
  const tone = getTaskStatusTone(category);
  const badgeClassKey = BADGE_CLASS_BY_TONE[tone];
  const badgeToneClass = badgeClassKey ? styles[badgeClassKey as keyof typeof styles] : undefined;
  const badgeClassName = [styles.statusBadge, badgeToneClass].filter(Boolean).join(" ");

  return (
    <Modal
      title={isEditing ? "Edit Task" : "Add Task"}
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      centered
      okButtonProps={{ style: { background: "#FA3356", borderColor: "#FA3356" } }}
      forceRender
    >
      <Form layout="vertical" form={form} preserve={false}>
        <Form.Item
          label="Task"
          name="name"
          rules={[{ required: true, message: "Task name required" }]}
        >
          <AutoComplete
            options={taskNameOptions}
            listHeight={160}
            placeholder="Enter or select task"
            filterOption={(inputValue, option) =>
              (option?.value as string)?.toUpperCase().includes(inputValue.toUpperCase())
            }
          />
        </Form.Item>

        <Form.Item
          label={
            <div className={styles.modalStatusLabelRow}>
              <span className={styles.modalStatusLabel}>Status</span>
              <span className={badgeClassName}>{label}</span>
            </div>
          }
          name="status"
          initialValue="todo"
        >
          <Select size="small" options={STATUS_OPTIONS} />
        </Form.Item>

        <Form.Item label="Assignee" name="assignedTo">
          <Select size="small" options={assigneeOptions} />
        </Form.Item>

        <Form.Item label="Due Date" name="dueDate">
          <Input type="date" />
        </Form.Item>

        <Form.Item label="Priority" name="priority">
          <Input />
        </Form.Item>

        <Form.Item label="Budget Code" name="budgetItemId">
          <Select options={budgetOptions} />
        </Form.Item>

        <Form.Item label="Event ID" name="eventId">
          <Input />
        </Form.Item>

        <Form.Item label="Location" name="location">
          <Input placeholder="{lat, lng}" value={locationDisplay} readOnly />
        </Form.Item>

        <Form.Item label="Address" name="address">
          <LocationSearchInput
            value={locationSearch}
            suggestions={locationSuggestions}
            selectedAddress={selectedAddress}
            onChange={onLocationSearchChange}
            onSelect={onLocationSuggestionSelect}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default TaskEditModal;
