import React from "react";
import { AutoComplete, Button, DatePicker, Form, Select } from "antd";
import type { FormInstance } from "antd/es/form";

import type { NominatimSuggestion } from "../types";
import LocationSearchInput from "./LocationSearchInput";

const priorityOptions = ["Low", "Medium", "High"].map((priority) => ({
  value: priority,
  label: priority,
}));

type AssignTaskFormProps = {
  form: FormInstance;
  taskNameOptions: { label: string; value: string }[];
  assigneeOptions: { value: string; label: string }[];
  budgetOptions: { value: string; label: string; elementId: string }[];
  locationSearch: string;
  locationSuggestions: NominatimSuggestion[];
  selectedAddress: string;
  onLocationSearchChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onLocationSuggestionSelect: (suggestion: NominatimSuggestion) => void;
  onSubmit: () => void;
};

const AssignTaskForm: React.FC<AssignTaskFormProps> = ({
  form,
  taskNameOptions,
  assigneeOptions,
  budgetOptions,
  locationSearch,
  locationSuggestions,
  selectedAddress,
  onLocationSearchChange,
  onLocationSuggestionSelect,
  onSubmit,
}) => (
  <Form form={form} layout="vertical" className="assign-task-form">
    <h3>Assign Task</h3>

    <div className="form-row">
      <Form.Item
        label="Task Name"
        name="name"
        rules={[{ required: true, message: "Task name required" }]}
      >
        <AutoComplete
          size="small"
          options={taskNameOptions}
          listHeight={160}
          placeholder="Enter or select task"
          filterOption={(inputValue, option) =>
            (option?.value as string)?.toUpperCase().includes(inputValue.toUpperCase())
          }
        />
      </Form.Item>

      <Form.Item label="Assigned To" name="assignedTo">
        <Select size="small" options={assigneeOptions} />
      </Form.Item>

      <Form.Item label="Due Date" name="dueDate">
        <DatePicker size="small" format="YYYY-MM-DD" />
      </Form.Item>
    </div>

    <Form.Item name="location" hidden>
      <input type="hidden" />
    </Form.Item>

    <div className="form-row">
      <Form.Item label="Priority" name="priority">
        <Select size="small" options={priorityOptions} />
      </Form.Item>

      <Form.Item label="Budget Element Id" name="budgetCode">
        <Select
          size="small"
          options={budgetOptions}
          showSearch
          optionLabelProp="elementId"
          filterOption={(input, option) =>
            (option?.label as string).toLowerCase().includes(input.toLowerCase())
          }
          getPopupContainer={(trigger) => trigger.parentNode as HTMLElement}
          popupRender={(menu) => menu}
        />
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
    </div>

    <div className="form-row actions">
      <Button
        type="primary"
        size="small"
        className="modal-submit-button"
        onClick={onSubmit}
        style={{ background: "#FA3356", borderColor: "#FA3356" }}
      >
        Save
      </Button>
    </div>
  </Form>
);

export default AssignTaskForm;
