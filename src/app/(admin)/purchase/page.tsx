'use client';

import React, { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';

type PurchaseImage = {
  id: string;
  image_url: string;
  created_at: string;
  name: string;
};

export default function PurchasePage() {
  const supabase = createClientComponentClient();
  const [images, setImages] = useState<PurchaseImage[]>([]);
  const [filteredImages, setFilteredImages] = useState<PurchaseImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<PurchaseImage | null>(null);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [photoName, setPhotoName] = useState('');

  useEffect(() => {
    fetchImages();
  }, []);

  const fetchImages = async () => {
    const { data, error } = await supabase
      .from('purchase_images')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching images:', error.message);
    } else {
      setImages(data as PurchaseImage[]);
      setFilteredImages(data as PurchaseImage[]);
    }
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    setFilteredImages(
      images.filter((img) =>
        img.name.toLowerCase().includes(value.toLowerCase())
      )
    );
  };

  const handleUpload = async () => {
    if (!uploadFile || !photoName.trim()) {
      toast.error('Please provide a photo name and file.');
      return;
    }

    const fileExt = uploadFile.name.split('.').pop();
    const fileName = `${Date.now()}-${uuidv4()}.${fileExt}`;
    const filePath = `uploads/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('purchase-images')
      .upload(filePath, uploadFile);

    if (uploadError) {
      toast.error('Upload failed.');
      console.error(uploadError.message);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('purchase-images').getPublicUrl(filePath);

    const { error: dbError } = await supabase
      .from('purchase_images')
      .insert([{ image_url: publicUrl, name: photoName }]);

    if (dbError) {
      toast.error('Failed to save record.');
      console.error(dbError.message);
    } else {
      toast.success('Image uploaded successfully');
      setUploadFile(null);
      setPhotoName('');
      setShowModal(false);
      fetchImages();
    }
  };

  return (
    <div className="min-h-screen py-4 px-6">
      {/* Title */}
      <h1 className="text-3xl font-bold mb-4 font-sans">Purchase Image Upload</h1>

      {/* Search + Upload Button */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="text"
          placeholder="Search by photo name..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="border border-gray-300 px-4 py-2 rounded w-full sm:w-72"
        />
        <button
          onClick={() => setShowModal(true)}
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
                Time Uploaded
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredImages.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-600">
                  No images found.
                </td>
              </tr>
            ) : (
              filteredImages.map((img, idx) => (
                <tr key={img.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-3 text-sm">{idx + 1}</td>
                  <td className="px-4 py-3 text-sm">
                    <button
                      onClick={() => setSelectedImage(img)}
                      className="text-blue-600 underline hover:text-blue-800 break-all"
                    >
                      {img.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {new Date(img.created_at).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Upload */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white p-6 rounded-xl max-w-md w-full shadow-lg relative">
            <h2 className="text-xl font-semibold mb-4">Upload Purchase Image</h2>
            <input
              type="text"
              placeholder="Enter photo name"
              value={photoName}
              onChange={(e) => setPhotoName(e.target.value)}
              className="w-full border border-gray-300 p-2 rounded mb-3"
            />
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="w-full border border-gray-300 p-2 rounded mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-600 hover:underline"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                className="bg-[#181918] text-white px-4 py-2 rounded hover:bg-black"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-white max-w-4xl w-full mx-4 p-6 rounded shadow-lg relative">
            <img
              src={selectedImage.image_url}
              alt="Preview"
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
