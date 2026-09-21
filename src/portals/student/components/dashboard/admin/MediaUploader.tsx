import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Progress } from '@student/components/ui/progress';
import { supabase } from '@student/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, Image, X, Copy, Check } from 'lucide-react';
import { cn } from '@student/lib/utils';

interface MediaUploaderProps {
  onUploadComplete?: (url: string) => void;
  acceptedFileTypes?: string;
  maxSizeMB?: number;
  bucketName?: string;
}

export function MediaUploader({ 
  onUploadComplete,
  acceptedFileTypes = "image/*",
  maxSizeMB = 5,
  bucketName = "website_media"
}: MediaUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const uploadFile = async (file: File) => {
    try {
      setUploading(true);
      setUploadProgress(0);

      // Validate file size
      const fileSizeMB = file.size / (1024 * 1024);
      if (fileSizeMB > maxSizeMB) {
        toast.error(`File size must be less than ${maxSizeMB}MB`);
        return;
      }

      // Create unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${fileName}`;

      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      // Upload to Supabase Storage
      const { error: uploadError, data } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      clearInterval(progressInterval);

      if (uploadError) {
        throw uploadError;
      }

      setUploadProgress(100);

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from(bucketName)
        .getPublicUrl(filePath);

      setUploadedUrl(publicUrl);
      toast.success('File uploaded successfully!');
      
      if (onUploadComplete) {
        onUploadComplete(publicUrl);
      }

    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Failed to upload file');
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      
      // Create preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setPreview(e.target?.result as string);
        };
        reader.readAsDataURL(file);
      }
      
      uploadFile(file);
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // Create preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setPreview(e.target?.result as string);
        };
        reader.readAsDataURL(file);
      }
      
      uploadFile(file);
    }
  };

  const copyToClipboard = () => {
    if (uploadedUrl) {
      navigator.clipboard.writeText(uploadedUrl);
      setCopied(true);
      toast.success('URL copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const clearUpload = () => {
    setUploadedUrl(null);
    setPreview(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="w-5 h-5" />
          Upload Media
        </CardTitle>
        <CardDescription>
          Upload images and media files to use in your content (Max: {maxSizeMB}MB)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!uploadedUrl ? (
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
              dragActive 
                ? "border-primary bg-primary/5" 
                : "border-muted-foreground/25 hover:border-primary/50"
            )}
          >
            <input
              id="file-upload"
              type="file"
              accept={acceptedFileTypes}
              onChange={handleFileInput}
              disabled={uploading}
              className="hidden"
            />
            
            <label htmlFor="file-upload" className="cursor-pointer">
              <div className="flex flex-col items-center gap-4">
                {preview ? (
                  <img 
                    src={preview} 
                    alt="Preview" 
                    className="max-h-40 rounded-lg object-cover"
                  />
                ) : (
                  <Image className="w-12 h-12 text-muted-foreground" />
                )}
                
                <div>
                  <p className="text-sm font-medium mb-1">
                    {dragActive ? "Drop file here" : "Click to upload or drag and drop"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {acceptedFileTypes === "image/*" ? "Images only" : "Any file"} (Max {maxSizeMB}MB)
                  </p>
                </div>

                {!uploading && (
                  <Button type="button" variant="outline" size="sm">
                    <Upload className="w-4 h-4 mr-2" />
                    Select File
                  </Button>
                )}
              </div>
            </label>

            {uploading && (
              <div className="mt-4">
                <Progress value={uploadProgress} className="h-2" />
                <p className="text-xs text-muted-foreground mt-2">
                  Uploading... {uploadProgress}%
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg">
              <Image className="w-5 h-5 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium mb-1">File uploaded successfully!</p>
                <p className="text-xs text-muted-foreground truncate">{uploadedUrl}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearUpload}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {preview && (
              <div className="relative rounded-lg overflow-hidden">
                <img 
                  src={preview} 
                  alt="Uploaded" 
                  className="w-full max-h-60 object-cover"
                />
              </div>
            )}

            <div className="flex gap-2">
              <Input 
                value={uploadedUrl} 
                readOnly 
                className="font-mono text-xs"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={copyToClipboard}
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>

            <Button 
              onClick={clearUpload}
              variant="outline" 
              className="w-full"
            >
              Upload Another File
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
