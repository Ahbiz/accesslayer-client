import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { courseService } from '@/services/course.service';
import type { Course } from '@/services/course.service';
import BondingCurveChart from '@/components/common/BondingCurveChart';
import CreatorProfileHeader from '@/components/common/CreatorProfileHeader';
import KeySupplyBadge from '@/components/common/KeySupplyBadge';
import { formatCreatorKeyPriceDisplay } from '@/utils/keyPriceDisplay.utils';
import { resolveCreatorKeyPriceStroops } from '@/utils/keyPriceDisplay.utils';
import { BUY_QUANTITY_BOUNDS } from '@/constants/fees';
import { Button } from '@/components/ui/button';
import { CreatorDashboardSkeleton } from '@/components/common/CreatorSkeleton';
import { bpsToPercent, formatNumber } from '@/utils/numberFormat.utils';
import {
	resolveCreatorKeyPriceStroops,
	formatDisplayKeyPrice,
} from '@/utils/keyPriceDisplay.utils';
import KeyDetailPageErrorBoundary from '@/components/common/KeyDetailPageErrorBoundary';
import { ApiError } from '@/services/api.service';
import WatchlistButton from '@/components/common/WatchlistButton';
import { useNavigationTiming } from '@/hooks/useNavigationTiming';
import { useKeyHolders } from '@/hooks/useKeyHolders';
import { useProfileStore } from '@/hooks/useProfileStore';
import { useWalletHoldings, useTradeMutation } from '@/hooks/useWallet';
import CoCreatorSection from '@/components/creator/CoCreatorSection';
import ShareTwitterButton from '@/components/common/ShareTwitterButton';
import TradeDialog from '@/components/common/TradeDialog';
import SpreadIndicator from '@/components/common/SpreadIndicator';
import OraclePriceIndicator from '@/components/common/OraclePriceIndicator';
import { useKeyOraclePrice } from '@/hooks/useKeyOraclePrice';
import showToast from '@/utils/toast.util';
import { getSignatureErrorMessage } from '@/utils/errorHandling.utils';
import { usePurchaseConfetti } from '@/hooks/usePurchaseConfetti';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useKeyTwap } from '@/hooks/useKeyTwap';
import { useKeyStats } from '@/hooks/useKeyStats';
import { useKeyConfig } from '@/hooks/useKeyConfig';
import KeyStatsPanel from '@/components/common/KeyStatsPanel';
import Skeleton from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import KeyDeprecationBanner from '@/components/common/KeyDeprecationBanner';
import KeyBuybackModal from '@/components/common/KeyBuybackModal';
import type { KeyBuybackReceipt } from '@/hooks/useKeyBuyback';
import { usePerformanceBond } from '@/hooks/usePerformanceBond';
import PerformanceBondPanel from '@/components/common/PerformanceBondPanel';

function CreatorDetailPageContent() {
	usePurchaseConfetti();

	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const { isConnected } = useAccount();
	const { isMismatch: isNetworkMismatch, expectedChainName } = useNetworkMismatch();

	const [creator, setCreator] = useState<Course | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [buyQuantity, setBuyQuantity] = useState<number>(1);
	const [isProcessing, setIsProcessing] = useState(false);

	useEffect(() => {
		const fetchCreator = async () => {
			if (!id) {
				setError('Creator ID is required');
				setLoading(false);
				return;
			}

			try {
				setLoading(true);
				const data = await courseService.getCourse(id);
				setCreator(data);
			} catch (err) {
				setError('Failed to load creator details');
				console.error('Error fetching creator:', err);
			} finally {
				setLoading(false);
			}
		};

		fetchCreator();
	}, [id]);

	const handleBuyQuantityChange = (value: string) => {
		const numValue = parseInt(value.replace(/,/g, ''), 10);
		if (!isNaN(numValue) && numValue >= BUY_QUANTITY_BOUNDS.MIN_QTY && numValue <= BUY_QUANTITY_BOUNDS.MAX_QTY) {
			setBuyQuantity(numValue);
		}
	};

	const handleBuy = async () => {
		if (!creator) return;

	// Performance bond status for creator key protection (#975)
	const {
		data: performanceBondData,
		isLoading: isPerformanceBondLoading,
		isError: isPerformanceBondError,
	} = usePerformanceBond(id || '');
	const performanceBond =
		performanceBondData ?? creator?.performanceBond ?? null;

	// Track stale data indicator
	const { shouldShowBadge, handleRefetch } = useCreatorProfileStaleIndicator(
		id || '',
		isFetching,
		() => refetch()
	);

		if (isNetworkMismatch) {
			toast.error(`Switch to ${expectedChainName} to purchase keys`, {
				duration: 4000,
			});
			return;
		}

		setIsProcessing(true);
		try {
			// Simulate purchase - in real implementation, this would interact with the smart contract
			await new Promise(resolve => setTimeout(resolve, 1500));
			toast.success(`Successfully purchased ${buyQuantity} key(s) for ${creator.title}!`);
			// Refresh creator data to get updated supply
			const updatedCreator = await courseService.getCourse(id!);
			setCreator(updatedCreator);
		} catch (err) {
			toast.error('Purchase failed. Please try again.');
			console.error('Purchase error:', err);
		} finally {
			setIsProcessing(false);
		}
	};

	if (loading) {
		return (
			<div className="min-h-screen bg-slate-950 flex items-center justify-center">
				<div className="text-white/60">Loading creator details...</div>
			</div>
		);
	}

	if (error || !creator) {
		return (
			<div className="min-h-screen bg-slate-950 flex items-center justify-center">
				<div className="text-center">
					<p className="text-red-400 mb-4">{error || 'Creator not found'}</p>
					<Button onClick={() => navigate('/')} variant="outline">
						Back to Marketplace
					</Button>
				</div>
			</div>
		);
	}

	const currentPriceStroops = resolveCreatorKeyPriceStroops(creator);
	const currentSupply = creator.creatorShareSupply || 0;

	return (
		<main className="min-h-screen bg-[#06111f] px-6 py-16 text-white md:px-12">
			<div className="mx-auto max-w-7xl space-y-8">
				<CreatorBreadcrumb
					parentLabel="Marketplace"
					parentHref="/"
					currentLabel={`${creator.title} Profile`}
				/>
				{/* Key deprecation notice & guaranteed buyback flow (#923) */}
				{isKeyDeprecated(creator) && (
					<KeyDeprecationBanner
						creator={creator}
						userAddress={userAddress}
						holdingsCount={holdingsCount}
						onInitiateBuyback={() => setBuybackModalOpen(true)}
						recentSettlement={recentSettlement}
					/>
				)}
				<div className="flex items-start gap-3">
					<div className="min-w-0 flex-1">
						<CreatorProfileHeader
							name={creator.title}
							handle={creator.socialHandle || creator.instructorId}
							creatorId={creator.id}
							isVerified={creator.isVerified}
							avatarUrl={creator.thumbnail}
							bio={creator.description}
							priceStroops={resolveCreatorKeyPriceStroops(creator)}
							showBackButton={hasMounted}
							onBack={() => {
								if (
									window.history.length > 1 &&
									location.key !== 'default'
								) {
									navigate(-1);
									return;
								}
								navigate('/creators');
							}}
						/>
					</div>
					<WatchlistButton
						creator={creator}
						labelName={creator.title}
						className="mt-3 shrink-0"
					/>
				</div>
				{/* 4 Stat Cards */}
				<div data-testid="creator-stat-cards">
					<CreatorProfileStatRow items={statItems} />
				</div>
				{/* Key Stats Panel (#952) */}
				<KeyStatsPanel
					stats={keyStats}
					isLoading={isKeyStatsLoading}
					isError={isKeyStatsError}
				/>
				{/* Performance Bond Status Panel (#975) */}
				<PerformanceBondPanel
					bond={performanceBond}
					isLoading={isPerformanceBondLoading}
					isError={isPerformanceBondError}
				/>
				{/* Deprecation Notice and Buy Action on Key Detail Page */}
				{isKeyDeprecated(creator) && (
					<div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4">
						<DeprecationNotice reason={creator.deprecationReason} />
					</div>
				)}
				<div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
					<div>
						<p className="text-xs font-semibold uppercase tracking-wider text-white/55">
							Key Purchase
						</p>
						<p className="mt-0.5 text-sm text-white/80">
							{isKeyDeprecated(creator)
								? 'Key is deprecated. New buys are disabled.'
								: 'Purchase keys for this creator.'}
						</p>
						{/* Configurable bid-ask spread between buy and sell price (#951) */}
						<SpreadIndicator
							className="mt-2"
							buyPriceStroops={keyConfig?.buyPriceStroops}
							sellPriceStroops={keyConfig?.sellPriceStroops}
							spreadStroops={keyConfig?.spreadStroops}
							spreadBps={keyConfig?.spreadBps}
							isLoading={isKeyConfigLoading}
						/>
						{/* Oracle reference price next to the curve spot price (#967) */}
						<OraclePriceIndicator
							className="mt-2"
							comparison={oracleComparison}
							freshness={oracleFreshness}
							source={oracleSource}
							isLoading={isOracleLoading}
						/>
					</div>
					<Button
						disabled={isKeyDeprecated(creator)}
						data-testid="key-detail-buy-button"
						onClick={() => setBuyDialogOpen(true)}
						variant={isKeyDeprecated(creator) ? 'outline' : 'default'}
						className="rounded-xl font-bold"
					>
						{isKeyDeprecated(creator)
							? 'Buy Disabled (Deprecated)'
							: 'Buy Key'}
					</Button>
				</div>
				{/* Buy Cooldown Countdown (only meaningful for authenticated users) */}
				{userAddress && (
					<BuyCooldownCountdown nextBuyAllowedAt={nextBuyAllowedAt} />
				)}
				{/* Share to X Button (only visible for authenticated holders) */}
				<div className="flex justify-end">
					<ShareTwitterButton
						creatorId={creator.id}
						creatorName={creator.title}
						priceXlm={formatDisplayKeyPrice(
							resolveCreatorKeyPriceStroops(creator)
						).replace(' XLM', '')}
						userAddress={userAddress}
						userHoldingsCount={holdingsCount}
					/>
				</div>
				{isTwapLoading ? (
					<div
						className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4"
						data-testid="twap-price"
					>
						<div aria-label="Loading 24 hour TWAP" role="status">
							<Skeleton className="h-3 w-24" />
							<Skeleton className="mt-2 h-6 w-32" />
						</div>
					</div>

					{/* Right column - Purchase card */}
					<div className="lg:col-span-1">
						<div className="bg-white/5 rounded-2xl border border-white/10 p-6 sticky top-24">
							<h2 className="text-xl font-bold text-white mb-6">Purchase Keys</h2>

							<div className="space-y-4">
								<div>
									<label className="block text-sm font-medium text-white/80 mb-2">
										Current Price
									</label>
									<div className="text-2xl font-bold text-amber-400">
										{formatCreatorKeyPriceDisplay(creator)}
									</div>
								</div>

								<div>
									<label className="block text-sm font-medium text-white/80 mb-2">
										Current Supply
									</label>
									<KeySupplyBadge supply={currentSupply} />
								</div>

								<div>
									<FormInput
										id="buyQuantity"
										label="Quantity to Buy"
										type="number"
										value={buyQuantity}
										onChange={handleBuyQuantityChange}
										className="w-full"
									/>
									<p className="text-xs text-white/40 mt-1">
										Min: {BUY_QUANTITY_BOUNDS.MIN_QTY}, Max: {BUY_QUANTITY_BOUNDS.MAX_QTY}
									</p>
								</div>

								<Button
									onClick={handleBuy}
									disabled={isProcessing || isNetworkMismatch}
									className={cn(
										'w-full rounded-xl font-bold',
										!isConnected && 'border-white/10 hover:bg-white/5'
									)}
									size="lg"
								>
									{isProcessing ? (
										'Processing...'
									) : (
										<>
											<ShoppingCart className="mr-2" />
											Buy {buyQuantity} Key{buyQuantity > 1 ? 's' : ''}
										</>
									)}
								</Button>

								{isNetworkMismatch && (
									<p className="text-xs text-red-400 text-center">
										Switch to {expectedChainName} to enable purchases
									</p>
								)}

								{!isConnected && (
									<p className="text-xs text-white/40 text-center">
										Connect your wallet to purchase keys
									</p>
								)}
							</div>

							<div className="mt-6 pt-6 border-t border-white/10">
								<h3 className="text-sm font-medium text-white/80 mb-3">Price Impact Preview</h3>
								<div className="text-sm text-white/60">
									<p>
										Buying {buyQuantity} key{buyQuantity > 1 ? 's' : ''} will move you along the bonding curve,
										increasing the price for future buyers.
									</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			</main>
		</div>
	);
};

export default CreatorDetailPage;
