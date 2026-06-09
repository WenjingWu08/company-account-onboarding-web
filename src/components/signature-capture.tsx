"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import SignatureCanvas from "react-signature-canvas";

export type SignatureCaptureHandle = {
  clear: () => void;
  isEmpty: () => boolean;
  toDataUrl: () => string | null;
};

type SignatureCaptureProps = {
  onEnd: () => void;
};

const SignatureCapture = forwardRef<SignatureCaptureHandle, SignatureCaptureProps>(
  function SignatureCapture({ onEnd }, ref) {
    const canvasRef = useRef<SignatureCanvas | null>(null);

    useImperativeHandle(ref, () => ({
      clear: () => {
        canvasRef.current?.clear();
      },
      isEmpty: () => canvasRef.current?.isEmpty() ?? true,
      toDataUrl: () => canvasRef.current?.toDataURL("image/png") ?? null,
    }));

    return (
      <SignatureCanvas
        ref={canvasRef}
        penColor="#16181d"
        minWidth={0.6}
        maxWidth={1.6}
        canvasProps={{
          className: "signature-canvas",
        }}
        onEnd={onEnd}
      />
    );
  },
);

export default SignatureCapture;
