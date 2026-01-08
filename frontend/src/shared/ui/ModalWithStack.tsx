import React, { ComponentProps } from 'react';
import Modal from 'react-modal';

type ClassState = {
  base: string;
  afterOpen: string;
  beforeClose: string;
};

type ModalWithStackProps = Omit<ComponentProps<typeof Modal>, 'className' | 'overlayClassName'> & {
  className?: string | ClassState;
  overlayClassName?: string | ClassState;
  closeTimeoutMS?: number;
};

type ModalWithStackComponent = React.FC<ModalWithStackProps> & {
  setAppElement: typeof Modal.setAppElement;
};

const ModalWithStack: ModalWithStackComponent = ({ isOpen, ...rest }) => {
  return <Modal isOpen={isOpen} {...(rest as ComponentProps<typeof Modal>)} />;
};

ModalWithStack.setAppElement = Modal.setAppElement;

export default ModalWithStack;










