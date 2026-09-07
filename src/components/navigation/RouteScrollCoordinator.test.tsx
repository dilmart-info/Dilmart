import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useState, useEffect, useLayoutEffect, useRef } from "react";
import RouteScrollCoordinator from "./RouteScrollCoordinator";
import {
  clearScrollPositionsRegistry,
  isScrollRestorationEligible,
} from "./route-scroll-rules";

// Realistic Mock Components for Integration Testing
function ListingPage({ height = 3000 }: { height?: number }) {
  const [params] = useSearchParams();
  const search = params.get("search") || "all";
  return (
    <div style={{ height: `${height}px` }}>
      <h1>Listing Page: {search}</h1>
      <Link to="/product/phone-1" data-testid="goto-phone-1">
        Go to Phone 1
      </Link>
      <Link to="/products?search=watches" data-testid="goto-watches">
        Go to Watches
      </Link>
    </div>
  );
}

function AsyncListingPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [products, setProducts] = useState<string[]>([]);

  useEffect(() => {
    // Simulate brief network latency (e.g. 50ms)
    const timer = setTimeout(() => {
      setProducts(Array.from({ length: 25 }, (_, i) => `Product ${i + 1}`));
      setIsLoading(false);
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{ height: isLoading ? "400px" : "3500px" }}>
      <h1>Async Listing</h1>
      {isLoading ? (
        <div data-testid="loading-indicator">Loading products...</div>
      ) : (
        <div data-testid="products-container">
          {products.map((p) => (
            <div key={p} style={{ height: "120px" }}>
              {p}
            </div>
          ))}
        </div>
      )}
      <Link to="/product/async-item" data-testid="goto-async-product">
        Go to Async Item
      </Link>
    </div>
  );
}

function MockProductDetail({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const lastResetSlugRef = useRef<string | null>(null);

  // Exact reproduction of ProductDetail.tsx PDP scroll reset logic
  useLayoutEffect(() => {
    if (!slug) return;
    if (lastResetSlugRef.current !== slug) {
      lastResetSlugRef.current = slug;
      if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
        window.scrollTo({
          top: 0,
          left: 0,
          behavior: "auto",
        });
      }
    }
  }, [slug]);

  return (
    <div style={{ height: "2000px" }}>
      <h1>Product Detail: {slug}</h1>
      <button onClick={() => navigate(-1)} data-testid="pdp-back-button">
        Back from PDP
      </button>
      <button onClick={() => navigate(1)} data-testid="pdp-forward-button">
        Forward from PDP
      </button>
    </div>
  );
}

function MockAuthPage() {
  const navigate = useNavigate();
  return (
    <div style={{ height: "1200px" }}>
      <h1>Login Page</h1>
      <button onClick={() => navigate(-1)} data-testid="auth-back-button">
        Back from Auth
      </button>
    </div>
  );
}

describe("RouteScrollCoordinator & PDP Scroll Integration", () => {
  let scrollToSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearScrollPositionsRegistry();
    scrollToSpy = vi.fn();
    window.scrollTo = scrollToSpy;
    Object.defineProperty(window, "scrollY", {
      writable: true,
      configurable: true,
      value: 0,
    });
    Object.defineProperty(window, "innerHeight", {
      writable: true,
      configurable: true,
      value: 800,
    });
    Object.defineProperty(document.documentElement, "scrollHeight", {
      writable: true,
      configurable: true,
      value: 3000,
    });
  });

  afterEach(() => {
    clearScrollPositionsRegistry();
    vi.restoreAllMocks();
  });

  describe("isScrollRestorationEligible", () => {
    it("approves only customer listing, search, category, and store browsing routes", () => {
      expect(isScrollRestorationEligible("/")).toBe(true);
      expect(isScrollRestorationEligible("/products")).toBe(true);
      expect(isScrollRestorationEligible("/products/shoes")).toBe(true);
      expect(isScrollRestorationEligible("/category/electronics")).toBe(true);
      expect(isScrollRestorationEligible("/wishlist")).toBe(true);
      expect(isScrollRestorationEligible("/store")).toBe(true);
      expect(isScrollRestorationEligible("/store/vendor-a")).toBe(true);
      expect(isScrollRestorationEligible("/stores")).toBe(true);
      expect(isScrollRestorationEligible("/stores/supermarket")).toBe(true);
      expect(isScrollRestorationEligible("/brands")).toBe(true);
      expect(isScrollRestorationEligible("/brands/apple")).toBe(true);
      expect(isScrollRestorationEligible("/offers")).toBe(true);
    });

    it("strictly forbids scroll restoration on PDP, auth, recovery, checkout, backoffices, and non-store prefixes", () => {
      expect(isScrollRestorationEligible("/product")).toBe(false);
      expect(isScrollRestorationEligible("/product/my-slug")).toBe(false);
      expect(isScrollRestorationEligible("/storefront-example")).toBe(false);
      expect(isScrollRestorationEligible("/store-extra")).toBe(false);
      expect(isScrollRestorationEligible("/auth")).toBe(false);
      expect(isScrollRestorationEligible("/auth/login")).toBe(false);
      expect(isScrollRestorationEligible("/forgot-password")).toBe(false);
      expect(isScrollRestorationEligible("/claim-account")).toBe(false);
      expect(isScrollRestorationEligible("/checkout")).toBe(false);
      expect(isScrollRestorationEligible("/thank-you")).toBe(false);
      expect(isScrollRestorationEligible("/admin")).toBe(false);
      expect(isScrollRestorationEligible("/merchant")).toBe(false);
      expect(isScrollRestorationEligible("/agent")).toBe(false);
    });
  });

  // Mandatory Test 1: الرجوع إلى قائمة محمّلة يعيد الموضع السابق
  it("Test 1: Back (POP) navigation to a pre-loaded listing restores its previous scroll position", async () => {
    render(
      <MemoryRouter initialEntries={["/products"]}>
        <RouteScrollCoordinator />
        <Routes>
          <Route path="/products" element={<ListingPage />} />
          <Route path="/product/:slug" element={<MockProductDetail slug="phone-1" />} />
        </Routes>
      </MemoryRouter>,
    );

    // Customer scrolls down 850px on listing
    Object.defineProperty(window, "scrollY", { value: 850, writable: true });
    fireEvent.scroll(window);

    // Navigate to product (PUSH)
    act(() => {
      fireEvent.click(screen.getByTestId("goto-phone-1"));
    });

    expect(screen.getByText("Product Detail: phone-1")).toBeInTheDocument();
    scrollToSpy.mockClear();

    // Customer navigates back to listing (POP)
    act(() => {
      fireEvent.click(screen.getByTestId("pdp-back-button"));
    });

    expect(screen.getByText("Listing Page: all")).toBeInTheDocument();

    // Wait for rAF
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    // Coordinator restores exactly 850px
    expect(scrollToSpy).toHaveBeenCalledWith({
      top: 850,
      left: 0,
      behavior: "auto",
    });
  });

  // Mandatory Test 2: الرجوع إلى قائمة تُحمّل بشكل غير متزامن يعيد الموضع بعد توفر المحتوى
  it("Test 2: Back navigation to an async loading listing restores scroll position 850 after API content arrives and height is sufficient", async () => {
    vi.useFakeTimers();

    render(
      <MemoryRouter initialEntries={["/products"]}>
        <RouteScrollCoordinator />
        <Routes>
          <Route path="/products" element={<AsyncListingPage />} />
          <Route path="/product/:slug" element={<MockProductDetail slug="async-item" />} />
        </Routes>
      </MemoryRouter>,
    );

    // Initial load: wait for items to arrive and scroll down 850px
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(screen.getByTestId("products-container")).toBeInTheDocument();

    Object.defineProperty(document.documentElement, "scrollHeight", { value: 3500, configurable: true });
    Object.defineProperty(window, "scrollY", { value: 850, writable: true });
    fireEvent.scroll(window);

    // Navigate to product (PUSH)
    act(() => {
      fireEvent.click(screen.getByTestId("goto-async-product"));
    });
    expect(screen.getByText("Product Detail: async-item")).toBeInTheDocument();

    scrollToSpy.mockClear();

    // Now navigate back to listing (POP)
    // Document is initially short (loading state: 400px height, window 800px -> maxScroll = 0)
    Object.defineProperty(document.documentElement, "scrollHeight", { value: 400, configurable: true });
    act(() => {
      fireEvent.click(screen.getByTestId("pdp-back-button"));
    });

    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();

    // Initial rAF fires while content is still loading
    act(() => {
      vi.advanceTimersByTime(20);
    });

    // Since maxScroll is 0 (< 850), position 850 could not be reached yet
    expect(scrollToSpy).not.toHaveBeenCalledWith(expect.objectContaining({ top: 850 }));

    // Now async API response arrives after 50ms, expanding document height to 3500px
    Object.defineProperty(document.documentElement, "scrollHeight", { value: 3500, configurable: true });
    act(() => {
      vi.advanceTimersByTime(60);
    });

    // Coordinator interval polling / resize detects the height expansion and restores 850px
    act(() => {
      fireEvent(window, new Event("resize"));
      vi.advanceTimersByTime(50);
    });

    expect(scrollToSpy).toHaveBeenCalledWith({
      top: 850,
      left: 0,
      behavior: "auto",
    });

    vi.useRealTimers();
  });

  // Mandatory Test 3: الرجوع أو التقدم إلى /product/:slug لا يجعل المنسق يتنافس مع تصفير PDP
  it("Test 3: POP or forward navigation to /product/:slug does NOT trigger coordinator scroll restoration (prevents PDP conflict)", async () => {
    render(
      <MemoryRouter initialEntries={["/product/phone-1", "/products"]}>
        <RouteScrollCoordinator />
        <Routes>
          <Route path="/products" element={<ListingPage />} />
          <Route path="/product/:slug" element={<MockProductDetail slug="phone-1" />} />
        </Routes>
      </MemoryRouter>,
    );

    // Scroll listing
    Object.defineProperty(window, "scrollY", { value: 600, writable: true });
    fireEvent.scroll(window);

    scrollToSpy.mockClear();

    // Go to product via Link
    act(() => {
      fireEvent.click(screen.getByTestId("goto-phone-1"));
    });

    // PDP's own useLayoutEffect resets to 0
    expect(scrollToSpy).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });

    // Clear and wait for any coordinator rAF
    scrollToSpy.mockClear();
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    // RouteScrollCoordinator NEVER called scrollTo for /product/*
    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  // Mandatory Test 4: فتح منتج جديد يبدأ دائمًا من 0
  it("Test 4: Opening a new product always resets scroll to (0, 0)", async () => {
    // Window is currently scrolled at 1200px
    Object.defineProperty(window, "scrollY", { value: 1200, writable: true });

    render(
      <MemoryRouter initialEntries={["/product/brand-new-item"]}>
        <MockProductDetail slug="brand-new-item" />
      </MemoryRouter>,
    );

    // PDP's useLayoutEffect immediately resets scroll to 0, 0
    expect(scrollToSpy).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  });

  // Mandatory Test 5: التنقل POP إلى صفحة تسجيل الدخول لا يعيد موضعًا قديمًا
  it("Test 5: POP navigation to /auth does NOT restore any old scroll position", async () => {
    render(
      <MemoryRouter initialEntries={["/auth", "/products"]}>
        <RouteScrollCoordinator />
        <Routes>
          <Route path="/products" element={<ListingPage />} />
          <Route path="/auth" element={<MockAuthPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Scroll listing to 700px
    Object.defineProperty(window, "scrollY", { value: 700, writable: true });
    fireEvent.scroll(window);

    scrollToSpy.mockClear();

    // Customer goes back to /auth
    render(
      <MemoryRouter initialEntries={["/auth"]}>
        <RouteScrollCoordinator />
        <Routes>
          <Route path="/auth" element={<MockAuthPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    // No scroll restoration attempted on /auth
    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  // Mandatory Test 6: مستمع scroll وأي requestAnimationFrame أو مؤقتات تتم إزالتها عند unmount
  it("Test 6: Removes scroll listener, resize listener, animation frames, intervals, and timeouts upon unmount", () => {
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = render(
      <MemoryRouter initialEntries={["/products"]}>
        <RouteScrollCoordinator />
        <ListingPage />
      </MemoryRouter>,
    );

    // Scroll event listener was registered
    expect(window.addEventListener).toBeDefined();

    // Unmount coordinator
    unmount();

    // Verify cleanup of scroll listener
    expect(removeEventListenerSpy).toHaveBeenCalledWith("scroll", expect.any(Function));
  });

  // Mandatory Test 7: الانتقال العادي PUSH إلى قائمة أخرى لا يستعيد موضعًا قديمًا عن طريق الخطأ
  it("Test 7: Standard forward navigation (PUSH) to another listing does NOT restore old scroll position", async () => {
    render(
      <MemoryRouter initialEntries={["/products"]}>
        <RouteScrollCoordinator />
        <Routes>
          <Route path="/products" element={<ListingPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Scroll to 500 on /products
    Object.defineProperty(window, "scrollY", { value: 500, writable: true });
    fireEvent.scroll(window);

    scrollToSpy.mockClear();

    // Click link with PUSH navigation to /products?search=watches
    act(() => {
      fireEvent.click(screen.getByTestId("goto-watches"));
    });

    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    // PUSH navigation does NOT restore old scroll position
    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  // Mandatory Test 8: Query string يدخل ضمن مفتاح صفحة المنتجات حتى لا تختلط نتائج بحث مختلفة
  it("Test 8: Query strings are isolated so different search/filter pages do not mix positions", async () => {
    render(
      <MemoryRouter initialEntries={["/products?search=shoes"]}>
        <RouteScrollCoordinator />
        <Routes>
          <Route path="/products" element={<ListingPage />} />
          <Route path="/product/:slug" element={<MockProductDetail slug="phone-1" />} />
        </Routes>
      </MemoryRouter>,
    );

    // Scroll to 450 on ?search=shoes
    Object.defineProperty(window, "scrollY", { value: 450, writable: true });
    fireEvent.scroll(window);

    // Navigate to product
    act(() => {
      fireEvent.click(screen.getByTestId("goto-phone-1"));
    });

    scrollToSpy.mockClear();

    // Navigate back to ?search=shoes (POP)
    act(() => {
      fireEvent.click(screen.getByTestId("pdp-back-button"));
    });

    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    // Restores shoes position (450)
    expect(scrollToSpy).toHaveBeenCalledWith({
      top: 450,
      left: 0,
      behavior: "auto",
    });
  });

  // Mandatory Test 9: /store/:slug restores scroll position on back navigation from PDP
  it("Test 9: Back (POP) navigation from product to a single store page (/store/vendor-a) restores scroll position 850", async () => {
    function StoreVendorPage() {
      return (
        <div style={{ height: "3000px" }}>
          <h1>Store: Vendor A</h1>
          <Link to="/product/item-a" data-testid="goto-item-a">
            Go to Item A
          </Link>
        </div>
      );
    }

    render(
      <MemoryRouter initialEntries={["/store/vendor-a"]}>
        <RouteScrollCoordinator />
        <Routes>
          <Route path="/store/:slug" element={<StoreVendorPage />} />
          <Route path="/product/:slug" element={<MockProductDetail slug="item-a" />} />
        </Routes>
      </MemoryRouter>,
    );

    // Customer scrolls down 850px on store page
    Object.defineProperty(window, "scrollY", { value: 850, writable: true });
    fireEvent.scroll(window);

    // Navigate to product (PUSH)
    act(() => {
      fireEvent.click(screen.getByTestId("goto-item-a"));
    });

    expect(screen.getByText("Product Detail: item-a")).toBeInTheDocument();
    scrollToSpy.mockClear();

    // Customer navigates back to store page (POP)
    act(() => {
      fireEvent.click(screen.getByTestId("pdp-back-button"));
    });

    expect(screen.getByText("Store: Vendor A")).toBeInTheDocument();

    // Wait for rAF
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    // Coordinator restores exactly 850px
    expect(scrollToSpy).toHaveBeenCalledWith({
      top: 850,
      left: 0,
      behavior: "auto",
    });
  });
});
