import React from "react";
import { Input, Modal } from "antd";

interface CommentModalProps {
  open: boolean;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSave: () => void;
  onCancel: () => void;
}

const CommentModal: React.FC<CommentModalProps> = ({ open, value, onChange, onSave, onCancel }) => (
  <Modal
    title="Edit Comment"
    open={open}
    onOk={onSave}
    onCancel={onCancel}
    centered
    okButtonProps={{ style: { background: "#FA3356", borderColor: "#FA3356" } }}
  >
    <Input.TextArea value={value} onChange={onChange} rows={4} />
  </Modal>
);

export default CommentModal;
