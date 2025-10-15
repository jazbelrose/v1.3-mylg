import Cropper from "react-easy-crop";

import Modal from "@/shared/ui/ModalWithStack";

import styles from "@/dashboard/home/components/finish-line-component.module.css";

import type { ThumbnailModalState } from "../projectHeaderTypes";

interface ThumbnailModalProps {
  modal: ThumbnailModalState;
}

const ThumbnailModal = ({ modal }: ThumbnailModalProps) => (
  <Modal
    isOpen={modal.isOpen}
    onRequestClose={modal.close}
    contentLabel="Change Thumbnail"
    closeTimeoutMS={300}
    className={{
      base: styles.modalContent,
      afterOpen: styles.modalContentAfterOpen,
      beforeClose: styles.modalContentBeforeClose,
    }}
    overlayClassName={styles.modalOverlay}
  >
    <h4 style={{ marginBottom: "20px" }}>Choose a Thumbnail</h4>

    <div
      style={{
        marginBottom: "20px",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div
          style={{
            width: "150px",
            height: "150px",
            borderRadius: "20px",
            border: modal.preview
              ? "none"
              : `2px dashed ${modal.isDragging ? "#FA3356" : "#ccc"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            color: "#ccc",
            cursor: modal.preview ? "default" : "pointer",
            position: "relative",
          }}
          onClick={!modal.preview ? () => modal.fileInputRef.current?.click() : undefined}
          onDragOver={!modal.preview ? modal.onDragOver : undefined}
          onDragLeave={!modal.preview ? modal.onDragLeave : undefined}
          onDrop={!modal.preview ? modal.onDrop : undefined}
        >
          <input
            type="file"
            accept="image/*"
            ref={modal.fileInputRef}
            onChange={modal.onFileChange}
            style={{ display: "none" }}
          />

          {modal.preview ? (
            <div style={{ position: "relative", width: 150, height: 150 }}>
              <Cropper
                image={modal.preview}
                crop={modal.crop}
                zoom={modal.zoom}
                aspect={1}
                onCropChange={modal.onCropChange}
                onZoomChange={modal.onZoomChange}
                onCropComplete={(_, area) => modal.onCropComplete(area)}
                objectFit="cover"
              />
            </div>
          ) : (
            <span style={{ width: "100%" }}>Click or drag thumbnail here</span>
          )}

          {modal.isDragging && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(0,0,0,0.6)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
                borderRadius: "20px",
              }}
            >
              Drop to upload
            </div>
          )}

          {modal.isUploading && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(0,0,0,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "20px",
              }}
            >
              <div className="dot-loader">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
        </div>

        {modal.preview && (
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={modal.zoom}
            onChange={(event) => modal.onZoomChange(parseFloat(event.target.value))}
            style={{ width: "150px", marginTop: "10px" }}
          />
        )}

        {modal.preview && (
          <button
            className="modal-button secondary"
            type="button"
            onClick={modal.remove}
            style={{ marginTop: "10px", borderRadius: "5px", padding: "5px 10px" }}
          >
            Remove
          </button>
        )}
      </div>
    </div>

    <div
      style={{
        display: "flex",
        justifyContent: "center",
        gap: "10px",
        marginTop: "30px",
      }}
    >
      <button
        className="modal-button primary"
        onClick={modal.upload}
        style={{ padding: "10px 20px", borderRadius: "5px" }}
        disabled={modal.isUploading}
      >
        Save
      </button>
      <button
        className="modal-button secondary"
        onClick={modal.close}
        style={{ padding: "10px 20px", borderRadius: "5px" }}
      >
        Cancel
      </button>
    </div>
  </Modal>
);

export default ThumbnailModal;
