import React from 'react';

const PendingApprovalScreen: React.FC = () => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      overflow: 'hidden',
      padding: '20px',
      textAlign: 'center',
    }}
  >
    <div
      className="pending-approval-message"
      style={{
        padding: '20px',
        maxWidth: '500px',
        borderRadius: '10px',
        backgroundColor: '#0c0c0c',
        color: '#fff',
        border: '2px solid white',
        boxShadow: '0 0 15px rgba(255, 255, 255, 0.3)',
      }}
    >
      <h2 style={{ marginBottom: '10px', whiteSpace: 'nowrap' }}>
        Account Pending Approval
      </h2>
      <p
        style={{
          fontSize: '16px',
          lineHeight: '1.5',
          wordBreak: 'keep-all',
          overflowWrap: 'break-word',
        }}
      >
        Your account is currently pending approval.
        <br />
        You will be notified by email when your account has been activated.
        <br />
        Please contact support if you have any questions @ <br />{' '}
        <a
          href="mailto:info@mylg.studio"
          style={{
            color: '#FA3356',
            textDecoration: 'underline',
            whiteSpace: 'nowrap',
          }}
        >
          info@mylg.studio
        </a>
        .
      </p>
    </div>
  </div>
);

export default PendingApprovalScreen;










