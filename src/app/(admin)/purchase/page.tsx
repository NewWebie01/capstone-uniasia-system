'use client';

import React, { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { v4 as uuidv4 } from 'uuid';

type PurchaseImage = {
  id: string;
  image_url: string;
  created_at: string;
  name: string;
};

export default function PurchasePage() {
  const supabase = createClientComponentClient();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [images, setImages] = useState<PurchaseImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<PurchaseImage | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

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

  const handleSubmit = async () => {
    if (!file || !name.trim()) return alert('Please enter a name and choose a file.');

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
      .insert([{ image_url: publicUrl, name }]);

    if (dbError) {
      alert('Failed to save record.');
      console.error(dbError.message);
    } else {
      alert('Image uploaded successfully!');
      setFile(null);
      setName('');
      setModalOpen(false);
      fetchImages();
    }
  };

  const filteredImages = images.filter((img) =>
    img.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen py-4 px-6">
      {/* Title */}
<div className="flex items-center justify-between mb-4">
  <h1 className="text-3xl font-bold">Purchase Image Upload</h1>
  <button
    onClick={() => setModalOpen(true)}
    className="bg-[#181918] hover:bg-black text-white px-6 py-2 rounded font-semibold mr-12" // 👈 Adjust here
  >
    Upload
  </button>
</div>


      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by photo name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="border border-gray-300 px-4 py-2 rounded w-full max-w-sm"
        />
      </div>

      {/* Table */}
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
                  No images uploaded yet.
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
                    {new Date(img.created_at).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: 'numeric',
                    })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Upload Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded-xl w-full max-w-md shadow-lg relative">
            <h2 className="text-xl font-bold mb-4">Upload Image</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Photo Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-gray-300 px-3 py-2 rounded"
                  placeholder="Enter name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Select File</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="w-full"
                />
              </div>

              <div className="flex justify-between pt-4">
                <button
                  onClick={() => setModalOpen(false)}
                  className="text-gray-600 hover:underline text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  className="bg-[#181918] text-white px-4 py-2 rounded hover:bg-black"
                >
                  Submit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
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
