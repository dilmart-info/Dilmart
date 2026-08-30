import { Navigate } from "react-router-dom";

/** @deprecated M14-UX moved finance console to /admin/finance/* */
export default function AdminFinanceReconciliation() {
  return <Navigate to="/admin/finance" replace />;
}
