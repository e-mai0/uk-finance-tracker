// src/app/cv-print/layout.tsx
// Minimal layout: no AppNav, no dock. Just the CV content + print styles.
export default function CvPrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        @page {
          size: A4;
          margin: 18mm 16mm;
        }
        @media print {
          body { padding: 0; background: white; }
          .no-print { display: none !important; }
        }
        .cv-print-wrapper {
          max-width: 42rem;
          margin: 0 auto;
          padding: 1.5rem;
          font-size: 0.9375rem;
        }
        @media print {
          .cv-print-wrapper { max-width: none; padding: 0; }
        }
      `}</style>
      {children}
    </>
  );
}
