"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle, Loader } from "lucide-react";
import type { DuplicateMatch } from "@/lib/jobs/duplicate-detection";

interface DuplicateDetectionModalProps {
  jobId: string;
  jobTitle: string;
  onClose: () => void;
  onMergeComplete?: () => void;
}

export function DuplicateDetectionModal({
  jobId,
  jobTitle,
  onClose,
  onMergeComplete,
}: DuplicateDetectionModalProps) {
  const [loading, setLoading] = useState(false);
  const [exact, setExact] = useState<DuplicateMatch[]>([]);
  const [similar, setSimilar] = useState<DuplicateMatch[]>([]);
  const [selectedDuplicate, setSelectedDuplicate] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  const [comparison, setComparison] = useState<{
    primary: { relatedCount: { applications: number; interviews: number; jobPosts: number } };
    secondary: { relatedCount: { applications: number; interviews: number; jobPosts: number } };
  } | null>(null);

  // Load duplicates on mount
  const loadDuplicates = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/jobs/duplicates?jobId=${jobId}`);
      const data = await response.json();
      setExact(data.exact || []);
      setSimilar(data.similar || []);
    } catch (error) {
      setMessage({
        type: "error",
        text: "Failed to load duplicate jobs",
      });
    } finally {
      setLoading(false);
    }
  };

  // Load comparison when duplicate is selected
  const loadComparison = async (duplicateId: string) => {
    try {
      const response = await fetch(
        `/api/jobs/duplicates?jobId=${jobId}&compareWith=${duplicateId}`
      );
      const data = await response.json();
      setComparison(data);
    } catch (error) {
      console.error("Failed to load comparison:", error);
    }
  };

  // Handle duplicate selection
  const handleSelectDuplicate = (duplicateId: string) => {
    setSelectedDuplicate(duplicateId);
    loadComparison(duplicateId);
  };

  // Handle merge
  const handleMerge = async () => {
    if (!selectedDuplicate) return;

    setMerging(true);
    try {
      const response = await fetch("/api/jobs/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryJobId: jobId,
          secondaryJobId: selectedDuplicate,
        }),
      });

      const result = await response.json();
      if (result.success) {
        setMessage({
          type: "success",
          text: `Successfully merged! ${result.affectedRecords.applications} applications and ${result.affectedRecords.interviews} interviews moved.`,
        });
        setTimeout(() => {
          onMergeComplete?.();
          onClose();
        }, 2000);
      } else {
        setMessage({
          type: "error",
          text: result.message || "Merge failed",
        });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: "Error during merge",
      });
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="border-b border-brand-lea/10 px-6 py-4 sticky top-0 bg-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-brand-lea">Duplicate Jobs</h2>
              <p className="mt-1 text-sm text-brand-grey">
                Finding duplicates for: <span className="font-medium">{jobTitle}</span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-brand-grey hover:text-brand-lea"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {message && (
            <div
              className={`rounded p-4 text-sm ${
                message.type === "success"
                  ? "border border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border border-red-300 bg-red-50 text-red-700"
              }`}
            >
              {message.text}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader className="h-6 w-6 animate-spin text-brand-lea" />
            </div>
          ) : exact.length === 0 && similar.length === 0 ? (
            <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/30 p-4 text-center">
              <CheckCircle className="mx-auto h-8 w-8 text-emerald-600" />
              <p className="mt-2 font-medium text-brand-lea">No duplicates found</p>
              <p className="mt-1 text-sm text-brand-grey">This job appears to be unique.</p>
            </div>
          ) : (
            <>
              {/* Exact Matches */}
              {exact.length > 0 && (
                <div>
                  <h3 className="mb-3 font-semibold text-brand-lea">
                    ⚠️ Exact Matches ({exact.length})
                  </h3>
                  <div className="space-y-2">
                    {exact.map((match) => (
                      <button
                        key={match.jobId}
                        onClick={() => handleSelectDuplicate(match.jobId)}
                        className={`w-full rounded border-2 p-3 text-left transition ${
                          selectedDuplicate === match.jobId
                            ? "border-brand-gold bg-brand-gold/10"
                            : "border-brand-lea/10 hover:border-brand-gold/50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-brand-lea">{match.title}</div>
                            {match.city && (
                              <div className="mt-1 text-xs text-brand-grey">
                                {match.city}, {match.state}
                              </div>
                            )}
                          </div>
                          <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700">
                            100%
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Similar Matches */}
              {similar.length > 0 && (
                <div>
                  <h3 className="mb-3 font-semibold text-brand-lea">
                    📊 Similar ({similar.length})
                  </h3>
                  <div className="space-y-2">
                    {similar.map((match) => (
                      <button
                        key={match.jobId}
                        onClick={() => handleSelectDuplicate(match.jobId)}
                        className={`w-full rounded border-2 p-3 text-left transition ${
                          selectedDuplicate === match.jobId
                            ? "border-brand-gold bg-brand-gold/10"
                            : "border-brand-lea/10 hover:border-brand-gold/50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-brand-lea">{match.title}</div>
                            <div className="mt-1 text-xs text-brand-grey">{match.matchReason}</div>
                            {match.city && (
                              <div className="mt-1 text-xs text-brand-grey">
                                {match.city}, {match.state}
                              </div>
                            )}
                          </div>
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">
                            {match.similarity}%
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Comparison Preview */}
              {selectedDuplicate && comparison && (
                <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/20 p-4">
                  <h3 className="mb-3 font-semibold text-brand-lea">Impact</h3>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded border border-brand-lea/10 bg-white p-3">
                      <div className="text-2xl font-bold text-brand-lea">
                        {comparison.secondary.relatedCount.applications}
                      </div>
                      <div className="text-xs text-brand-grey">Applications</div>
                      <div className="mt-1 text-xs text-brand-grey">will be moved</div>
                    </div>
                    <div className="rounded border border-brand-lea/10 bg-white p-3">
                      <div className="text-2xl font-bold text-brand-lea">
                        {comparison.secondary.relatedCount.interviews}
                      </div>
                      <div className="text-xs text-brand-grey">Interviews</div>
                      <div className="mt-1 text-xs text-brand-grey">will be moved</div>
                    </div>
                    <div className="rounded border border-brand-lea/10 bg-white p-3">
                      <div className="text-2xl font-bold text-brand-lea">
                        {comparison.secondary.relatedCount.jobPosts}
                      </div>
                      <div className="text-xs text-brand-grey">Job Posts</div>
                      <div className="mt-1 text-xs text-brand-grey">will be moved</div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && (exact.length > 0 || similar.length > 0) && (
          <div className="border-t border-brand-lea/10 bg-white px-6 py-4 flex items-center justify-between sticky bottom-0">
            <button
              onClick={onClose}
              className="rounded border border-brand-lea/20 px-4 py-2 text-sm font-semibold text-brand-lea hover:bg-brand-cloudDancer/20"
            >
              Cancel
            </button>
            <button
              onClick={handleMerge}
              disabled={!selectedDuplicate || merging}
              className="rounded bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-black hover:bg-brand-gold/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {merging && <Loader className="h-4 w-4 animate-spin" />}
              {merging ? "Merging..." : "Confirm Merge"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
