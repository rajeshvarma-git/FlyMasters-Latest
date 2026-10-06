import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@counselor/components/ui/Button";
import DocumentSetup from "@shared/components/DocumentSetup";

/** The shared Documents setup screen (same one admin uses), with a way back. */
export default function DocumentsSetup() {
  return (
    <DocumentSetup
      title="Set up documents"
      backSlot={
        <Link to="/documents">
          <Button variant="secondary" size="sm" className="mt-1">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </Link>
      }
    />
  );
}
