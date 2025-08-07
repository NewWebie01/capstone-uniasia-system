'use client';

import React, { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { v4 as uuidv4 } from 'uuid';

type PurchaseImage = {
  id: string;
  image_url: string;
  created_at: string;
};

export default function PurchasePage() {
  const supabase = createClientComponentClient();
  const [file, setFile] = useState<File | null>(null);
  const [images, setImages] = useState<PurchaseImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<PurchaseImage | null>(null);

  const fetchImages = async () => {
    const { data, error } = await supabase
      .from('purchase_images')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching images:', error.message);
    } else {
      setImages(data as PurchaseImage[]);
    }
  };

  useEffect(() => {
    fetchImages();
  }, []);

  const handleUpload = async () => {
    if (!file) return alert('Please select a file.');

    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${uuidv4()}.${fileExt}`;
    const filePath = `uploads/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('purchase-images')
      .upload(filePath, file);

    if (uploadError) {
      alert('Upload failed.');
      console.error(uploadError.message);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('purchase-images').getPublicUrl(filePath);

    const { error: dbError } = await supabase
      .from('purchase_images')
      .insert([{ image_url: publicUrl }]);

    if (dbError) {
      alert('Failed to save record.');
      console.error(dbError.message);
    } else {
      alert('Image uploaded successfully');
      setFile(null);
      fetchImages();
    }
  };

  return (
    <div className="min-h-screen py-4 px-6">
      {/* Page Title */}
      <h1 className="text-3xl font-bold mb-4 font-sans">Purchase Image Upload</h1>

      {/* Upload Form */}
      <div className="flex flex-wrap gap-2 items-center mb-4">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="border border-gray-300 px-4 py-2 rounded w-full sm:w-auto"
        />
        <button
          onClick={handleUpload}
          className="bg-[#181918] hover:bg-black text-white px-6 py-2 rounded font-semibold"
        >
          Upload
        </button>
      </div>

      {/* Images Table */}
      <div className="overflow-x-auto bg-white rounded-lg shadow">
        <table className="min-w-full table-auto">
          <thead className="bg-yellow-400">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-black">#</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-black">
                Photo of Purchase
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-black">
                Date &amp; Time Uploaded
              </th>
            </tr>
          </thead>
          <tbody>
            {images.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-600">
                  No images uploaded yet.
                </td>
              </tr>
            ) : (
              images.map((img, idx) => (
                <tr key={img.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-3 text-sm">{idx + 1}</td>
                  <td className="px-4 py-3 text-sm">
                    <button
                      onClick={() => setSelectedImage(img)}
                      className="text-blue-600 underline hover:text-blue-800 break-all"
                    >
                      {img.image_url.split('/').pop()}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {new Date(img.created_at).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Image Modal */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
          <div className="bg-white max-w-4xl w-full mx-4 p-6 rounded shadow-lg relative">
            <img
              src={selectedImage.image_url}
              alt="Full"
              className="w-full max-h-[80vh] object-contain mb-4"
            />
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-3 right-3 bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
