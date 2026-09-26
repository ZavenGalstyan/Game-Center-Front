export default function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className="fl-toast" key={toast.id}>
      {toast.text}
    </div>
  );
}
