import { Navigate, useParams } from "react-router-dom";

export default function Category() {
  const { slug } = useParams();
  if (!slug) return <Navigate to="/products" replace />;
  return <Navigate to={`/products?category=${encodeURIComponent(slug)}`} replace />;
}
