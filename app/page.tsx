'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useDropzone } from 'react-dropzone';

const supabase = createClient(
  'https://hazfudoashvafcgrmlkh.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhemZ1ZG9hc2h2YWZjZ3JtbGtoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg5OTY0MjIsImV4cCI6MjA3NDU3MjQyMn0.2z0TE2-LevP0vMiT8Zs3t8empcGfk1elT__VjQXHn0w'
);

interface Task {
  id: number;
  task_id: number;
  task_title: string;
  assigned_to: string;
  project_id: number;
  task_context: string;
  projects: {
    project_name: string;
    deliverables: string[];
  };
}

interface UploadedFile {
  name: string;
  url: string;
  size: number;
  type: string;
}

export default function SubmitPage() {
  const [task, setTask] = useState<Task | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [notes, setNotes] = useState<string>('');
  const [uploading, setUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const taskId = params.get('task');
    const token = params.get('token');

    if (!taskId || !token) {
      setError('Invalid link - missing task or token');
      return;
    }

    loadTask(taskId);
  }, []);

  async function loadTask(taskId: string) {
    try {
      console.log('Loading task:', taskId);

      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .select(`
          *,
          projects (
            project_name,
            deliverables
          )
        `)
        .eq('id', taskId)
        .single();

      console.log('Task Data:', taskData);
      console.log('Task Error:', taskError);

      if (taskError) {
        setError('Task not found: ' + taskError.message);
        return;
      }

      if (!taskData) {
        setError('Task not found');
        return;
      }

      setTask(taskData as Task);
    } catch (err) {
      console.error('Load Error:', err);
      setError('Failed to load task: ' + (err as Error).message);
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles: File[]) => {
      setFiles((prev) => [...prev, ...acceptedFiles]);
    },
  });

  async function handleSubmit() {
    if (files.length === 0) {
      alert('Please upload at least one file');
      return;
    }

    if (!task) {
      alert('Task not loaded');
      return;
    }

    setUploading(true);

    try {
      const uploadedFiles: UploadedFile[] = [];

      // Upload each file
      for (const file of files) {
        // Organized path: project_X/task_Y/timestamp_filename
        const fileName = `project_${task.project_id}/task_${task.id}/${Date.now()}_${file.name}`;

        const { error: uploadError } = await supabase.storage
          .from('task-output')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data } = supabase.storage
          .from('task-outputs')
          .getPublicUrl(fileName);

        uploadedFiles.push({
          name: file.name,
          url: data.publicUrl,
          size: file.size,
          type: file.type,
        });
      }

      console.log('Uploaded files:', uploadedFiles);

      // Generate view_id
      const viewId = Math.random().toString(36).substring(2, 10);

      // Create task_outputs record
      const { data: outputData, error: outputError } = await supabase
        .from('task_outputs')
        .insert({
          task_id: task.id,
          project_id: task.project_id,
          view_id: viewId,
          output_type: 'files',
          output_content: JSON.stringify(uploadedFiles),
          submitted_by_name: task.assigned_to,
          revision_number: 1,
          approval_status: 'pending',
          notes: notes,
        })
        .select()
        .single();

      if (outputError) throw outputError;

      console.log('Output saved:', outputData);

      // Update task status
      await supabase.from('tasks').update({ status: 'submitted' }).eq('id', task.id);

      setSuccess(true);
    } catch (err) {
      console.error('Upload error:', err);
      alert('Upload failed: ' + (err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{error}</h1>
          <p className="text-gray-600">Please contact your manager for a new upload link.</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Submission Successful!</h1>
          <p className="text-gray-600 mb-4">Your manager will be notified for review.</p>
          <button
            onClick={() => window.close()}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading task...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              📋 Submit: {task.task_title}
            </h1>
            <p className="text-gray-600">📂 Project: {task.projects?.project_name}</p>
          </div>

          {/* Task Context */}
          {task.task_context && (
            <div className="mb-8 p-4 bg-blue-50 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-3">📋 Task Context & Instructions:</h3>
              <div className="text-gray-700 whitespace-pre-wrap text-sm">
                {task.task_context}
              </div>
            </div>
          )}

          {/* Upload Zone */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload Files
            </label>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <input {...getInputProps()} />
              <div className="text-6xl mb-4">📎</div>
              <p className="text-lg font-medium text-gray-700 mb-2">
                {isDragActive ? 'Drop files here...' : 'Drag & drop files or click to browse'}
              </p>
              <p className="text-sm text-gray-500">
                Any format • Any size • Multiple files supported
              </p>
            </div>
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="mb-6">
              <h3 className="font-medium text-gray-900 mb-3">Selected Files:</h3>
              <ul className="space-y-2">
                {files.map((file, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded"
                  >
                    <span className="text-gray-700">{file.name}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-gray-500">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                      <button
                        onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                        className="text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Notes */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
              placeholder="Any additional notes for your manager..."
            />
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={uploading || files.length === 0}
            className="w-full py-3 px-6 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {uploading ? 'Uploading...' : 'Submit for Review'}
          </button>
        </div>
      </div>
    </div>
  );
}