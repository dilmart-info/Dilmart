import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import DesktopHeader from "@/components/header/DesktopHeader";
import MobileTopPromoBlock from "@/components/header/MobileTopPromoBlock";
import MobileInnerHeader from "@/components/header/MobileInnerHeader";
import MobileCheckoutHeader from "@/components/header/MobileCheckoutHeader";

const Header = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  const isHomePage = location.pathname === "/";
  const isCheckoutPage = location.pathname.startsWith("/checkout");

  const { data: categories } = useQuery({
    queryKey: ["marketplace-categories"],
    queryFn: () => apiClient.getMarketplaceCategories(),
  });

  const categoryTree =
    categories
      ?.filter((cat: { parent_id: string | null }) => !cat.parent_id)
      .map((parent: { id: string; children?: unknown[] }) => ({
        ...parent,
        children: categories.filter((child: { parent_id: string | null }) => child.parent_id === parent.id),
      })) || [];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/products?search=${encodeURIComponent(searchQuery)}`);
    }
  };

  return (
    <header className="sticky top-0 z-50">
      <DesktopHeader categories={categoryTree} searchQuery={searchQuery} setSearchQuery={setSearchQuery} onSearch={handleSearch} />
      {isHomePage ? (
        <MobileTopPromoBlock searchQuery={searchQuery} setSearchQuery={setSearchQuery} onSearch={handleSearch} />
      ) : isCheckoutPage ? (
        <MobileCheckoutHeader />
      ) : (
        <MobileInnerHeader />
      )}
    </header>
  );
};

export default Header;
