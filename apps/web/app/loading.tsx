import { LoadingState } from "@/components/states/loading-state";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-12 sm:px-6 lg:px-10">
      <LoadingState label="Loading page..." />
    </div>
  );
}
