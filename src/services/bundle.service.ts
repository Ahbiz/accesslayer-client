// src/services/bundle.service.ts
import { BaseApiService, type APIResponse } from './api.service';

/** A single key + quantity pair inside a bundle. */
export interface BundleLineItem {
	/** Creator key id included in the bundle. */
	keyId: string;
	/** How many units of that key the bundle contains. */
	quantity: number;
}

/**
 * Lifecycle status of a bundle.
 *
 * `active` and `expired` are both derived from `expiresAt`; `cancelled` is set
 * by the creator before expiry. Everything except `active` is archived.
 */
export type BundleStatus = 'active' | 'expired' | 'cancelled';

/** A creator-defined bundle of keys sold together at a discount. */
export interface KeyBundle {
	/** Bundle id. */
	id: string;
	/** Creator key the bundle is listed under. */
	creatorId: string;
	/** Per-key line items making up the bundle. */
	items: BundleLineItem[];
	/** Undiscounted total of every line item at list price, in XLM. */
	listPriceXlm: number;
	/** Price a buyer pays for the whole bundle, in XLM. */
	discountPriceXlm: number;
	/** ISO timestamp after which the bundle can no longer be purchased. */
	expiresAt: string;
	/** ISO timestamp of when the bundle was created. */
	createdAt: string;
	/** Number of completed bundle purchases. */
	purchaseCount: number;
	/** ISO timestamp of when the creator cancelled the bundle, when cancelled. */
	cancelledAt?: string | null;
}

/** Cursor-paginated envelope for the bundle list. */
export interface BundlesPage {
	bundles: KeyBundle[];
	nextCursor: string | null;
}

/** Payload for `create_bundle`. */
export interface CreateBundleRequest {
	/** Keys and quantities that make up the bundle. */
	items: BundleLineItem[];
	/** Discounted bundle price, in XLM. */
	discountPriceXlm: number;
	/** ISO timestamp after which the bundle expires. */
	expiresAt: string;
}

class BundleService extends BaseApiService {
	/**
	 * One cursor-paginated page of a creator's bundles -
	 * GET /creators/:creatorId/bundles.
	 *
	 * The API returns active and archived bundles together; the client splits
	 * them by comparing `expiresAt` against the current time so bundles archive
	 * the moment they expire, without waiting for a refetch.
	 */
	async getCreatorBundles(
		creatorId: string,
		cursor?: string | null
	): Promise<BundlesPage> {
		try {
			const response = await this.api.get<APIResponse<BundlesPage>>(
				`/creators/${creatorId}/bundles`,
				{ params: cursor ? { cursor } : undefined }
			);

			const data = response.data.data;
			return {
				bundles: Array.isArray(data?.bundles) ? data.bundles : [],
				nextCursor: data?.nextCursor ?? null,
			};
		} catch (error) {
			throw this.handleError(error);
		}
	}
}

export const bundleService = new BundleService();

/**
 * Convenience wrapper for fetching a page of a creator's bundles.
 * Exposed as a plain function to facilitate test spying.
 */
export async function fetchCreatorBundlesPage(
	creatorId: string,
	cursor: string | null | undefined
): Promise<BundlesPage> {
	return bundleService.getCreatorBundles(creatorId, cursor);
}
