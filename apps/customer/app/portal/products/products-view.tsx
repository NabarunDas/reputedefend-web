import { welcomeHeading } from "@/components/portal-ui"
import { productStatusLabel, type ProductCard } from "@/lib/portal/products/present"

function ProductMark({ mark }: { mark: ProductCard["mark"] }) {
  const paths = {
    recovery: "M6 7h12v12H6zM9 7V5h6v2M9 12h6M9 15h4",
    guard: "M12 3l7 3v6c0 4.2-2.8 7.2-7 9-4.2-1.8-7-4.8-7-9V6z",
    telloya: "M8 5h8v10H8zM10 19h4M9 8h6M9 11h6",
  } as const
  return (
    <svg className="products-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[mark]} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function ProductCardView({ product }: { product: ProductCard }) {
  return (
    <article className={`products-card products-card-${product.status}`} aria-labelledby={`product-${product.key}`}>
      <div className="products-card-top">
        <ProductMark mark={product.mark} />
        <p className={`products-status products-status-${product.status}`}>{product.statusLabel ?? productStatusLabel(product.status)}</p>
      </div>
      <h2 id={`product-${product.key}`}>{product.name}</h2>
      <p className="products-description">{product.description}</p>
      {product.context ? <p className="products-context">{product.context}</p> : null}
      {product.attention ? <p className="products-attention">{product.attention}</p> : null}
      {product.unavailableReason ? <p className="products-note">{product.unavailableReason}</p> : null}
      {product.action ? (
        <a className="products-action" href={product.action.href}>{product.action.label}</a>
      ) : null}
    </article>
  )
}

export function ProductsView({ accountName, products }: { accountName: string | null; products: readonly ProductCard[] }) {
  return (
    <div className="products-hub">
      <header className="portal-page-head">
        <p className="products-welcome">{welcomeHeading(accountName)}</p>
        <h1>My Products</h1>
        <p className="lead">Manage your services in one place.</p>
      </header>
      <section aria-label="Your products">
        <ul className="products-grid">
          {products.map(product => (
            <li key={product.key}>
              <ProductCardView product={product} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export function ProductsLoading() {
  return (
    <div className="products-hub products-state" role="status" aria-live="polite">
      <h1>My Products</h1>
      <p>Loading your products.</p>
    </div>
  )
}
