import { SignOutButton } from "../sign-out-button"
import type { ProductCard } from "@/lib/portal/products/present"

function ProductMark({ mark }: { mark: ProductCard["mark"] }) {
  const paths = {
    recovery: "M6 7h12v12H6zM9 7V5h6v2M9 12h6M9 15h4",
    guard: "M12 3.5l6.5 2.8v5.4c0 4.2-2.7 6.6-6.5 8.8-3.8-2.2-6.5-4.6-6.5-8.8V6.3L12 3.5z",
    telloya: "M8 5h8v10H8zM10 19h4M9 8h6M9 11h6",
  } as const
  return (
    <svg className="products-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[mark]} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function badgeClass(product: ProductCard): string {
  if (product.statusLabel === "Active" || product.statusLabel === "Partially active" || product.statusLabel === "Cases open") {
    return "products-status products-status-live"
  }
  if (product.status === "unavailable" || product.statusLabel === "Status temporarily unavailable") {
    return "products-status products-status-unavailable"
  }
  return "products-status products-status-exploring"
}

function ServiceTile({ product }: { product: ProductCard }) {
  return (
    <article className={`products-tile products-tile-${product.status}`} aria-labelledby={`product-${product.key}`}>
      <div className="products-tile-main">
        <ProductMark mark={product.mark} />
        <div className="products-tile-copy">
          <h3 id={`product-${product.key}`}>{product.name}</h3>
          <p className="products-description">{product.description}</p>
          {product.context ? <p className="products-context">{product.context}</p> : null}
          {product.attention ? <p className="products-attention">{product.attention}</p> : null}
          {product.unavailableReason ? <p className="products-note">{product.unavailableReason}</p> : null}
        </div>
      </div>
      <div className="products-tile-aside">
        {product.statusLabel ? <p className={badgeClass(product)}>{product.statusLabel}</p> : null}
        {product.actions.map(action => {
          const external = action.href.startsWith("http") || action.href.startsWith("mailto:")
          return (
            <a
              key={`${action.label}-${action.href}`}
              className={external ? "products-action products-action-secondary" : "products-action"}
              href={action.href}
              {...(external ? { rel: "noopener noreferrer" } : {})}
            >
              {action.label}
            </a>
          )
        })}
      </div>
    </article>
  )
}

function ServiceSection({ id, title, products }: { id: string; title: string; products: readonly ProductCard[] }) {
  return (
    <section className="products-section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <ul className="products-grid">
        {products.map(product => (
          <li key={product.key}>
            <ServiceTile product={product} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function LauncherIntro({ accountName, loading = false }: { accountName: string | null; loading?: boolean }) {
  return (
    <header className="products-intro">
      <div className="products-intro-copy">
        <p className="products-identity">Customer portal</p>
        <h1>My Products</h1>
        {loading ? null : <p className="lead">Manage your services from ProfileRelaunch</p>}
      </div>
      <div className="products-account">
        {loading ? null : <p className="products-account-name">{accountName ?? "My account"}</p>}
        <SignOutButton />
      </div>
    </header>
  )
}

export function ProductsView({ accountName, products }: { accountName: string | null; products: readonly ProductCard[] }) {
  const yours = products.filter(product => product.group === "yours")
  const explore = products.filter(product => product.group === "explore")
  const unconfirmed = products.filter(product => product.group === "unconfirmed")
  return (
    <div className="products-hub">
      <LauncherIntro accountName={accountName} />
      {yours.length === 0 ? (
        <p className="products-empty">
          {explore.length === 0
            ? "We couldn't confirm your services just now. This does not say whether they have been set up."
            : "Nothing is ready to open yet."}
        </p>
      ) : (
        <ServiceSection id="your-services" title="Your services" products={yours} />
      )}
      {explore.length > 0 ? <ServiceSection id="explore-services" title="Explore more services" products={explore} /> : null}
      {unconfirmed.length > 0 ? <ServiceSection id="unconfirmed-services" title="Status unavailable" products={unconfirmed} /> : null}
    </div>
  )
}

export function ProductsLoading() {
  return (
    <div className="products-hub products-state">
      <LauncherIntro accountName={null} loading />
      <p role="status" aria-live="polite">Loading your products.</p>
    </div>
  )
}
