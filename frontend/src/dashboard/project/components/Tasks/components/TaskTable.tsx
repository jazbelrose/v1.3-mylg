import React from "react";
import { Table } from "antd";
import type { ColumnsType } from "antd/es/table";

import type { Task } from "../types";

type TaskTableProps = {
  columns: ColumnsType<Task>;
  data: Task[];
};

const TaskTable: React.FC<TaskTableProps> = ({ columns, data }) => (
  <div
    className="tasks-table-wrapper"
    style={{ maxHeight: 400, overflow: "auto", position: "relative", paddingBottom: 0 }}
  >
    <Table<Task>
      rowKey="id"
      columns={columns}
      dataSource={data}
      pagination={false}
      size="small"
      tableLayout="fixed"
      className="tasks-table custom-sticky-scrollbar"
      scroll={{ x: "max-content", y: 340 }}
      locale={{ emptyText: "No tasks yet!" }}
      sticky={{ offsetHeader: 0, offsetScroll: 0 }}
      style={{ fontSize: "11px" }}
    />
  </div>
);

export default TaskTable;
